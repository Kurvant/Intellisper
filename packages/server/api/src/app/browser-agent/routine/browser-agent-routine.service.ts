import {
    AgentActionStatus,
    AgentSharableResourceType,
    type AgentVisibilityContext,
    ErrorCode,
    ibId,
    IntellisperError,
    isNil,
    type ReplayStep,
    type Routine,
    type RoutineParam,
    RoutineParamType,
    type RoutineRun,
    RoutineRunStatus,
    type RoutineStep,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager, IsNull } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { transaction } from '../../core/db/transaction'
import {
    AgentActionEntity,
    AgentConversationEntity,
    AgentRunEntity,
    RoutineEntity,
    RoutineRunEntity,
    RoutineStepEntity,
} from '../entities'
import { agentScope } from '../scope/agent-scope'

/**
 * Routine store + replay-plan builder (Phase 7). A Routine is RECORDED from the executed browser
 * actions of a finished agent run (single capture path — no separate DOM recorder), then REPLAYED
 * with different parameter values. Renamed from the source product's "workflow" to avoid colliding
 * with blockunits Flows.
 *
 * Hard rules (mirror the memory service + plan §4):
 *  - STRICT SCOPING: every read/write goes through `agentScope` — no query hand-writes a raw owner
 *    `where` on a routine table. The enforcement-gate test fails the build otherwise.
 *  - Replay EXECUTION lives in the runtime (it owns the resumable action loop). This service only
 *    persists routines and turns a routine + params into an ordered, param-substituted ReplayStep[]
 *    plan for the runtime to drive; and it owns the thin RoutineRun history lifecycle.
 *  - SELF-HEAL + PAUSE-FOR-HUMAN are runtime concerns; this service exposes the intent/locators
 *    each step needs for them.
 */

const routineRepo = repoFactory(RoutineEntity)
const stepRepo = repoFactory(RoutineStepEntity)
const runHistoryRepo = repoFactory(RoutineRunEntity)
const actionRepo = repoFactory(AgentActionEntity)
const agentRunRepo = repoFactory(AgentRunEntity)
const conversationRepo = repoFactory(AgentConversationEntity)

const LIMITS = {
    maxSteps: 40,
    maxPerUser: 100,
}

/** Browser-action tools a routine step may replay (server-side allowlist). */
const REPLAYABLE_ACTIONS = new Set(['navigate', 'click', 'type', 'selectOption', 'scroll', 'submitForm'])

export type RoutineScope = { userId: string, platformId: string, projectId: string }

/**
 * Build the visibility context for a scoped read. Sharing stays LOCKED (owner-only) until Phase 9
 * wires the platform-admin unlock + per-user opt-in from entitlements; until then a routine is only
 * ever visible to its owner — the safe default. (Memory is never sharable regardless; routines are.)
 */
function visibility(scope: RoutineScope): AgentVisibilityContext {
    return { platformId: scope.platformId, userId: scope.userId, sharingUnlocked: false }
}

/** A minimal shape of a recorded AgentAction row this service reads. */
type ActionRow = {
    type: string
    targetRef: string | null
    args: Record<string, unknown> | null
    result: Record<string, unknown> | null
}

// `_log` is accepted for interface parity with the other browser-agent services (callers pass their
// request logger); the routine store's ops are pure DB/logic and don't currently log.
export const browserAgentRoutine = (_log: FastifyBaseLogger) => ({
    limits: LIMITS,

    // ── Recording (from a finished agent run) ───────────────────────────────────────────────────

    /**
     * Capture the executed browser actions of a run into a new routine. Only EXECUTED, replayable
     * browser actions are captured, in execution order; server-side tools (readPage/recall/fetchUrl)
     * are intentionally skipped — a routine is a sequence of HANDS actions, not reasoning steps. Each
     * step stores multi-signal locators + a natural-language intent for self-heal.
     */
    async recordFromRun(
        scope: RoutineScope,
        runId: string,
        name: string,
        opts: { description?: string, params?: RoutineParam[] } = {},
    ): Promise<{ routine: Routine, stepCount: number }> {
        const cleanName = (name ?? '').trim()
        if (!cleanName) throw validation('A routine name is required.')

        await assertRunOwned(scope, runId)
        await assertUnderUserCap(scope)

        const actions = await actionRepo().find({
            where: { runId, status: AgentActionStatus.EXECUTED },
            order: { created: 'ASC' },
        })
        const replayable = actions.filter((a) => REPLAYABLE_ACTIONS.has(a.type)) as unknown as ActionRow[]
        if (!replayable.length) {
            throw validation('This run has no replayable browser actions to save as a routine.')
        }
        if (replayable.length > LIMITS.maxSteps) {
            throw validation(`This run has ${replayable.length} actions, which exceeds the routine limit of ${LIMITS.maxSteps}.`)
        }

        const params = (opts.params ?? []).filter((p) => p && typeof p.name === 'string' && p.name.trim())

        const routine = await routineRepo().save(routineRepo().create({
            id: ibId(),
            platformId: scope.platformId,
            userId: scope.userId,
            projectId: scope.projectId,
            name: cleanName.slice(0, 200),
            description: opts.description?.slice(0, 2000) ?? null,
            params,
            version: 1,
        }))

        const steps = replayable.map((action, i) => stepRepo().create({
            id: ibId(),
            routineId: routine.id,
            ordinal: i,
            action: action.type,
            locators: buildLocators(action),
            intent: deriveIntent(action),
            config: null,
        }))
        await stepRepo().save(steps)

        return { routine, stepCount: steps.length }
    },

    /**
     * One-click save from a finished run: derive a clean name from the conversation title when none
     * is supplied, record (no params), then auto-infer parameters from the typed values (rewriting
     * each such step's arg to a `{{placeholder}}`). The user can refine later in the panel.
     */
    async saveFromRunAuto(
        scope: RoutineScope,
        runId: string,
        opts: { name?: string, description?: string } = {},
    ): Promise<{ routine: Routine, stepCount: number, inferredParams: string[] }> {
        await assertRunOwned(scope, runId)

        let name = (opts.name ?? '').trim()
        if (!name) {
            const run = await agentRunRepo().findOneBy({ id: runId, ...agentScope.ownerFilter(scope) })
            const conv = run
                ? await conversationRepo().findOneBy({ id: run.conversationId, ...agentScope.ownerFilter(scope) })
                : null
            name = deriveRoutineName(conv?.title ?? '')
        }

        const { routine } = await this.recordFromRun(scope, runId, name, { description: opts.description })
        const inferred = await inferAndApplyParams(routine.id)

        const stepCount = await stepRepo().countBy({ routineId: routine.id })
        const refreshed = (await routineRepo().findOneBy({ id: routine.id, ...agentScope.ownerFilter(scope) })) ?? routine
        return { routine: refreshed, stepCount, inferredParams: inferred }
    },

    // ── Reads (strictly scoped via agentScope) ──────────────────────────────────────────────────

    async list(scope: RoutineScope, search?: string, page = 1, limit = 50): Promise<{ routines: Array<Pick<Routine, 'id' | 'name' | 'description' | 'params' | 'version'> & { updated: string }>, total: number }> {
        const qb = routineRepo().createQueryBuilder('r')
            .andWhere('r."deletedAt" IS NULL')
            .orderBy('r.updated', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
        agentScope.applyRead(qb, AgentSharableResourceType.ROUTINE, visibility(scope), { alias: 'r' })
        if (search && search.trim()) qb.andWhere('r.name ILIKE :s', { s: `%${search.trim()}%` })
        const [rows, total] = await qb.getManyAndCount()
        return {
            routines: rows.map((r) => ({ id: r.id, name: r.name, description: r.description, params: r.params, version: r.version, updated: r.updated })),
            total,
        }
    },

    /** Load a routine + its ordered steps, scoped to the owner. Throws if absent/not owned. */
    async getWithSteps(scope: RoutineScope, routineId: string): Promise<{ routine: Routine, steps: RoutineStep[] }> {
        const routine = await routineRepo().findOneBy({ id: routineId, ...agentScope.ownerFilter(scope), deletedAt: IsNull() })
        if (isNil(routine)) throw notFound('Routine not found')
        const steps = await stepRepo().find({ where: { routineId }, order: { ordinal: 'ASC' } })
        return { routine, steps }
    },

    /** Resolve a routine by id (exact) or case-insensitive name (most recent). For the runRoutine tool. */
    async resolveByNameOrId(scope: RoutineScope, nameOrId: string): Promise<Routine | null> {
        const key = (nameOrId ?? '').trim()
        if (!key) return null
        if (isUuid(key)) {
            const byId = await routineRepo().findOneBy({ id: key, ...agentScope.ownerFilter(scope), deletedAt: IsNull() })
            if (byId) return byId
        }
        return routineRepo().createQueryBuilder('r')
            .where('r."userId" = :uid', { uid: scope.userId })
            .andWhere('r."platformId" = :pid', { pid: scope.platformId })
            .andWhere('r."deletedAt" IS NULL')
            .andWhere('LOWER(r.name) = LOWER(:n)', { n: key })
            .orderBy('r.updated', 'DESC')
            .getOne()
    },

    async rename(scope: RoutineScope, routineId: string, name?: string, description?: string | null): Promise<Routine> {
        const { routine } = await this.getWithSteps(scope, routineId)
        if (name?.trim()) routine.name = name.trim().slice(0, 200)
        if (description !== undefined) routine.description = description?.slice(0, 2000) ?? null
        return routineRepo().save(routine)
    },

    /** Soft-delete a routine (owner-scoped). Returns whether a row was affected. */
    async remove(scope: RoutineScope, routineId: string): Promise<boolean> {
        // Verify ownership first (the update filter is owner-scoped, so a cross-user id affects 0 rows).
        const res = await routineRepo().update(
            { id: routineId, ...agentScope.ownerFilter(scope), deletedAt: IsNull() },
            { deletedAt: new Date().toISOString() },
        )
        return (res.affected ?? 0) > 0
    },

    // ── Dashboard management (edit params / steps, duplicate) ────────────────────────────────────

    /** Replace a routine's declared parameters' user-facing metadata (names are the binding keys). */
    async updateParams(scope: RoutineScope, routineId: string, params: RoutineParam[]): Promise<Routine> {
        const { routine } = await this.getWithSteps(scope, routineId)
        const byName = new Map((routine.params ?? []).map((p) => [p.name, p]))
        const clean: RoutineParam[] = (Array.isArray(params) ? params : [])
            .map((raw) => {
                const name = String(raw?.name ?? '').trim()
                if (!name || !byName.has(name)) return null // only edit declared params
                const base = byName.get(name)!
                return {
                    name,
                    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 100) : base.label,
                    type: raw.type ?? base.type,
                    required: typeof raw.required === 'boolean' ? raw.required : base.required,
                    options: Array.isArray(raw.options) ? raw.options.slice(0, 50).map(String) : base.options,
                    default: typeof raw.default === 'string' ? raw.default : base.default,
                } as RoutineParam
            })
            .filter((p): p is RoutineParam => p !== null)
        routine.params = clean
        routine.version = (routine.version ?? 1) + 1
        return routineRepo().save(routine)
    },

    /** Reorder a routine's steps to the given ordered list of step ids (two-phase to dodge clashes). */
    async reorderSteps(scope: RoutineScope, routineId: string, orderedStepIds: string[]): Promise<{ ordered: number }> {
        const { steps } = await this.getWithSteps(scope, routineId)
        const ids = new Set(steps.map((s) => s.id))
        const seq = orderedStepIds.filter((id) => ids.has(id))
        if (seq.length !== steps.length) {
            throw validation('The reorder must include every step exactly once.')
        }
        await transaction(async (em: EntityManager) => {
            for (let i = 0; i < seq.length; i++) {
                await em.update(RoutineStepEntity, { id: seq[i], routineId }, { ordinal: 1000 + i })
            }
            for (let i = 0; i < seq.length; i++) {
                await em.update(RoutineStepEntity, { id: seq[i], routineId }, { ordinal: i })
            }
        })
        await routineRepo().update({ id: routineId }, { version: () => '"version" + 1' })
        return { ordered: seq.length }
    },

    /** Delete one step and compact the remaining ordinals. */
    async deleteStep(scope: RoutineScope, routineId: string, stepId: string): Promise<{ removed: boolean }> {
        const { steps } = await this.getWithSteps(scope, routineId)
        if (!steps.some((s) => s.id === stepId)) return { removed: false }
        if (steps.length <= 1) throw validation('A routine must keep at least one step.')
        await transaction(async (em: EntityManager) => {
            await em.delete(RoutineStepEntity, { id: stepId, routineId })
            const remaining = steps.filter((s) => s.id !== stepId)
            for (let i = 0; i < remaining.length; i++) {
                await em.update(RoutineStepEntity, { id: remaining[i].id, routineId }, { ordinal: i })
            }
        })
        await routineRepo().update({ id: routineId }, { version: () => '"version" + 1' })
        return { removed: true }
    },

    /** Duplicate a routine (its steps + params) as a new editable copy. */
    async duplicate(scope: RoutineScope, routineId: string): Promise<Routine> {
        const { routine, steps } = await this.getWithSteps(scope, routineId)
        await assertUnderUserCap(scope)
        const copy = await routineRepo().save(routineRepo().create({
            id: ibId(),
            platformId: scope.platformId,
            userId: scope.userId,
            projectId: scope.projectId,
            name: `${routine.name} (copy)`.slice(0, 200),
            description: routine.description,
            params: routine.params,
            version: 1,
        }))
        if (steps.length) {
            await stepRepo().save(steps.map((s) => stepRepo().create({
                id: ibId(),
                routineId: copy.id,
                ordinal: s.ordinal,
                action: s.action,
                locators: s.locators,
                intent: s.intent,
                config: s.config,
            })))
        }
        return copy
    },

    // ── Replay plan (consumed by the runtime replay driver) ─────────────────────────────────────

    /**
     * Turn a routine + caller-supplied param values into an ordered, ready plan. Validates required
     * params, substitutes `{{param}}` placeholders in recorded step args (and condition/extract
     * config), and returns ReplayStep[]. Pure (no DB writes) — the RoutineRun lifecycle is owned by
     * the runtime so replay shares the same persist-and-resume model.
     */
    buildReplayPlan(routine: Routine, steps: RoutineStep[], paramValues: Record<string, unknown>): ReplayStep[] {
        const declared = routine.params ?? []
        const missing = declared
            .filter((p) => p.required)
            .filter((p) => {
                const v = paramValues?.[p.name]
                return v === undefined || v === null || (typeof v === 'string' && !v.trim())
            })
            .map((p) => p.name)
        if (missing.length) {
            throw validation(`Missing required parameter(s): ${missing.join(', ')}.`)
        }

        return steps.map((s) => {
            const recordedArgs = (s.locators?.recordedArgs as Record<string, unknown>) ?? {}
            const args = substituteParams(recordedArgs, paramValues)
            const config = s.config && Object.keys(s.config).length
                ? (substituteParams(s.config as Record<string, unknown>, paramValues) as Record<string, unknown>)
                : undefined
            return {
                ordinal: s.ordinal,
                action: s.action,
                locators: (s.locators ?? {}) as Record<string, unknown>,
                args,
                intent: s.intent,
                ...(config ? { config } : {}),
            }
        })
    },

    // ── RoutineRun: thin HISTORY/AUDIT record ────────────────────────────────────────────────────
    // Execution rides the agent's AgentRun (resumable loop + checkpoint + consequential gating).
    // These methods only record THAT a replay happened, who ran it, and how it ended.

    /** Open a history row when a replay starts, linked to the AgentRun that executes it. */
    async startRun(scope: RoutineScope, routineId: string, agentRunId: string, stepsTotal: number, batchJobId?: string, rowIndex?: number, paramValues?: Record<string, unknown>): Promise<RoutineRun> {
        return runHistoryRepo().save(runHistoryRepo().create({
            id: ibId(),
            routineId,
            platformId: scope.platformId,
            userId: scope.userId,
            projectId: scope.projectId,
            batchJobId: batchJobId ?? null,
            rowIndex: rowIndex ?? null,
            paramValues: paramValues ?? null,
            agentRunId,
            status: RoutineRunStatus.RUNNING,
            startedAt: new Date().toISOString(),
            progress: { stepsTotal, stepsCompleted: 0 },
        }))
    },

    /** Bind a pre-created history row (e.g. a batch row) to the AgentRun executing it. */
    async attachRunToHistory(historyId: string, agentRunId: string): Promise<void> {
        await runHistoryRepo().update({ id: historyId }, { agentRunId, status: RoutineRunStatus.RUNNING, startedAt: new Date().toISOString() })
    },

    /** Close a history row with a terminal/paused status and optional progress summary. */
    async finishRun(historyId: string, status: RoutineRunStatus, progress?: Record<string, unknown>): Promise<void> {
        const terminal = status !== RoutineRunStatus.PAUSED
        await runHistoryRepo().update(
            { id: historyId },
            { status, ...(terminal ? { endedAt: new Date().toISOString() } : {}), ...(progress ? { progress } : {}) } as never,
        )
    },

    /** History view: a user's recent routine runs (most recent first), owner-scoped. */
    async listRuns(scope: RoutineScope, routineId?: string, limit = 50): Promise<Array<Pick<RoutineRun, 'id' | 'routineId' | 'agentRunId' | 'status' | 'progress' | 'startedAt' | 'endedAt'>>> {
        const qb = runHistoryRepo().createQueryBuilder('r')
            .orderBy('r.created', 'DESC')
            .take(limit)
        agentScope.applyRead(qb, AgentSharableResourceType.ROUTINE_RUN, visibility(scope), { alias: 'r' })
        if (routineId) qb.andWhere('r."routineId" = :rid', { rid: routineId })
        const rows = await qb.getMany()
        return rows.map((r) => ({ id: r.id, routineId: r.routineId, agentRunId: r.agentRunId, status: r.status, progress: r.progress, startedAt: r.startedAt, endedAt: r.endedAt }))
    },
})

// ── Ownership / caps ────────────────────────────────────────────────────────────────────────────

/** Verify a run belongs to the caller via run → conversation, both owner-scoped. */
async function assertRunOwned(scope: RoutineScope, runId: string): Promise<void> {
    const run = await agentRunRepo().findOneBy({ id: runId, ...agentScope.ownerFilter(scope) })
    if (isNil(run)) throw notFound('Run not found')
    const conv = await conversationRepo().findOneBy({ id: run.conversationId, ...agentScope.ownerFilter(scope) })
    if (isNil(conv)) throw notFound('Run not found')
}

async function assertUnderUserCap(scope: RoutineScope): Promise<void> {
    const count = await routineRepo().countBy({ ...agentScope.ownerFilter(scope), deletedAt: IsNull() })
    if (count >= LIMITS.maxPerUser) {
        throw validation(`You have reached the limit of ${LIMITS.maxPerUser} saved routines. Delete one to save another.`)
    }
}

// ── Recording helpers ─────────────────────────────────────────────────────────────────────────

/**
 * Build the priority-ordered locating signals for a recorded step from the action's stored
 * targetRef/args and (when present) the observation result the action produced. Storing several
 * independent signals is what lets replay survive a ref/selector changing — it falls through to the
 * next one, and finally to the intent.
 */
function buildLocators(action: ActionRow): Record<string, unknown> {
    const args = action.args ?? {}
    const result = (action.result ?? {}) as Record<string, unknown>
    const locators: Record<string, unknown> = {}
    if (action.targetRef) locators.ref = action.targetRef

    const description = typeof args.description === 'string' ? args.description : undefined
    const field = typeof args.field === 'string' ? args.field.trim() : undefined
    const resolvedLabel = typeof result.fieldLabel === 'string' ? (result.fieldLabel as string).trim() : undefined
    const fieldLabel = field || resolvedLabel || undefined
    if (fieldLabel) locators.fieldLabel = fieldLabel
    if (description) locators.text = description
    else if (fieldLabel) locators.text = fieldLabel

    const role = typeof result.fieldRole === 'string' ? (result.fieldRole as string).trim() : undefined
    const a11yName = typeof result.fieldName === 'string' ? (result.fieldName as string).trim() : undefined
    if (role || a11yName) {
        locators.a11y = { ...(role ? { role } : {}), ...(a11yName ? { name: a11yName } : {}) }
    }

    if (action.type === 'navigate' && typeof args.url === 'string') locators.url = args.url
    if (action.type === 'selectOption' && typeof args.value === 'string') locators.value = args.value
    const fieldOptions = Array.isArray(result.fieldOptions)
        ? (result.fieldOptions as unknown[]).filter((o): o is string => typeof o === 'string')
        : undefined
    if (fieldOptions && fieldOptions.length) locators.fieldOptions = fieldOptions

    // Preserve raw args so replay can reconstruct the call; param placeholders (if any) are detected
    // at replay time from the routine's declared params against these values.
    locators.recordedArgs = args
    return locators
}

/**
 * A short natural-language statement of what the step accomplishes, used to self-heal when stored
 * locators no longer resolve. Prefer the model's own `description` arg; fall back to a deterministic
 * phrasing from the action + target.
 */
function deriveIntent(action: ActionRow): string {
    const args = action.args ?? {}
    if (typeof args.description === 'string' && args.description.trim()) return args.description.trim()
    switch (action.type) {
        case 'navigate':
            return `Navigate to ${typeof args.url === 'string' ? args.url : 'the next page'}.`
        case 'type': {
            const into = typeof args.field === 'string' && args.field.trim() ? `the ${args.field.trim()} field` : 'the target field'
            return `Type ${typeof args.text === 'string' ? `"${args.text}"` : 'text'} into ${into}.`
        }
        case 'selectOption': {
            const where = typeof args.field === 'string' && args.field.trim() ? `the ${args.field.trim()} dropdown` : 'the dropdown'
            return `Select the option ${typeof args.value === 'string' ? `"${args.value}"` : ''} in ${where}.`
        }
        case 'submitForm':
            return 'Submit the form.'
        case 'scroll':
            return `Scroll ${typeof args.direction === 'string' ? args.direction : 'the page'}.`
        default:
            return `Perform "${action.type}" on the target element.`
    }
}

// ── Parameter inference (one-click save) ────────────────────────────────────────────────────────

/**
 * Infer optional parameters from a recorded routine's fillable steps: each distinct non-trivial
 * typed value (or dropdown choice) becomes a parameter, and its step's recorded arg is rewritten to
 * a `{{placeholder}}` so replay substitutes a new value. Conservative — too-short/huge values are
 * skipped. Returns the inferred names.
 */
async function inferAndApplyParams(routineId: string): Promise<string[]> {
    const steps = await stepRepo().find({ where: { routineId }, order: { ordinal: 'ASC' } })
    const params: RoutineParam[] = []
    const seen = new Map<string, string>()
    const usedNames = new Set<string>()
    let counter = 0

    for (const step of steps) {
        const isType = step.action === 'type'
        const isSelect = step.action === 'selectOption'
        if (!isType && !isSelect) continue

        const args = (step.locators?.recordedArgs as Record<string, unknown>) ?? {}
        const argKey = isType ? 'text' : 'value'
        const value = typeof args[argKey] === 'string' ? (args[argKey] as string) : ''
        if (!value || value.length < 1 || value.length > 120) continue
        if (value.includes('{{')) continue
        if (isType && value.length < 2) continue

        const fieldLabel = deriveFieldLabel(step, args)
        const dedupeKey = `${fieldLabel ?? ''}::${value}`
        let paramName = seen.get(dedupeKey)
        if (!paramName) {
            const label = fieldLabel ?? labelFor(step.intent, '')
            paramName = uniqueParamName(label, usedNames, counter)
            counter++
            seen.set(dedupeKey, paramName)
            const param: RoutineParam = {
                name: paramName,
                label: label || prettifyName(paramName),
                type: isSelect ? RoutineParamType.SELECT : inferParamType(label, value),
                required: false,
                options: null,
                default: null,
            }
            if (isSelect) {
                const options = optionsForSelect(step, value)
                if (options.length) param.options = options
                param.default = value
            }
            params.push(param)
        }
        step.locators = { ...step.locators, recordedArgs: { ...args, [argKey]: `{{${paramName}}}` } }
        await stepRepo().save(step)
    }

    if (params.length) {
        await routineRepo().update({ id: routineId }, { params })
    }
    return params.map((p) => p.name)
}

function optionsForSelect(step: RoutineStep, recordedValue: string): string[] {
    const out = new Set<string>()
    if (recordedValue) out.add(recordedValue)
    const raw = step.locators?.fieldOptions
    if (Array.isArray(raw)) {
        for (const o of raw) {
            const v = typeof o === 'string' ? o : ''
            if (v && v.length <= 80) out.add(v.trim())
        }
    }
    return Array.from(out).slice(0, 50)
}

function deriveRoutineName(rawTitle: string): string {
    let t = (rawTitle ?? '').trim()
    if (!t) return 'Routine'
    t = t.split(/[.!?\n]/)[0].trim()
    t = t.replace(/^(this is|here is|on)\s+(a|an|the)\s+[\w ]{2,30}?[,:-]\s*/i, '').trim()
    if (t.length > 60) {
        t = t.slice(0, 60)
        t = t.slice(0, Math.max(t.lastIndexOf(' '), 20)).trim() + '…'
    }
    t = t.charAt(0).toUpperCase() + t.slice(1)
    return t || 'Routine'
}

function deriveFieldLabel(step: RoutineStep, args: Record<string, unknown>): string | null {
    const clean = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[:*]+$/, '').trim()
    const ok = (s: string) => s.length >= 2 && s.length <= 50 && !/^el-/.test(s)

    const field = typeof args.field === 'string' ? clean(args.field) : ''
    if (ok(field)) return titleCaseLabel(field)
    const resolved = typeof step.locators?.fieldLabel === 'string' ? clean(step.locators.fieldLabel as string) : ''
    if (ok(resolved)) return titleCaseLabel(resolved)

    const fromIntent = labelFor(step.intent ?? '', '')
    if (fromIntent) return titleCaseLabel(fromIntent)

    const text = typeof step.locators?.text === 'string' ? clean(step.locators.text as string) : ''
    if (ok(text)) return titleCaseLabel(text)

    return null
}

function labelFor(intent: string, fallback: string): string {
    const i = (intent ?? '').trim()
    if (!i) return fallback
    let m = i.match(/\b(?:into|in)\s+(?:the\s+)?["']?([\w][\w &/-]{1,40}?)["']?\s+(?:field|input|box|textbox|text\s*field)\b/i)
    if (m) return m[1].trim()
    m = i.match(/\b(?:type|enter|fill(?:\s+in)?|input|provide)\s+(?:in\s+)?(?:the\s+|your\s+|a\s+|an\s+)?([\w][\w &/-]{1,40})/i)
    if (m) {
        const t = m[1].trim().replace(/\b(into|in|field|input|box|value|text)\b.*$/i, '').trim()
        if (t && t.length >= 2) return t
    }
    return fallback
}

function titleCaseLabel(s: string): string {
    const t = s.replace(/\s+/g, ' ').trim()
    if (!t) return t
    return t.charAt(0).toUpperCase() + t.slice(1)
}

function prettifyName(name: string): string {
    const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

function uniqueParamName(label: string, used: Set<string>, counter: number): string {
    let base = (label || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((w, idx) => (idx === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join('')
    if (!base || base.length < 2) base = counter === 0 ? 'value' : `value${counter + 1}`
    if (/^\d/.test(base)) base = `field${base}`
    let name = base
    let n = 2
    while (used.has(name)) name = `${base}${n++}`
    used.add(name)
    return name
}

function inferParamType(label: string, sample: string): RoutineParamType {
    const l = (label || '').toLowerCase()
    if (/\bemail\b/.test(l) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sample)) return RoutineParamType.EMAIL
    if (/\b(phone|mobile|tel|telephone)\b/.test(l)) return RoutineParamType.TEL
    if (/\b(date|dob|birth)\b/.test(l)) return RoutineParamType.DATE
    if (/\b(number|amount|qty|quantity|age|zip|postal)\b/.test(l) || /^\d+$/.test(sample)) return RoutineParamType.NUMBER
    if (/\b(url|website|link)\b/.test(l) || /^https?:\/\//i.test(sample)) return RoutineParamType.URL
    return RoutineParamType.TEXT
}

// ── Param substitution (replay) ─────────────────────────────────────────────────────────────────

/** Replace any `{{paramName}}` placeholder string values with caller inputs (recurses nested config). */
function substituteParams(args: Record<string, unknown>, values: Record<string, unknown>): Record<string, unknown> {
    const sub = (s: string) =>
        s.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, name) => {
            const val = values?.[name]
            return val === undefined || val === null ? whole : String(val)
        })
    const walk = (v: unknown): unknown => {
        if (typeof v === 'string') return sub(v)
        if (Array.isArray(v)) return v.map(walk)
        if (v && typeof v === 'object') {
            const o: Record<string, unknown> = {}
            for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = walk(val)
            return o
        }
        return v
    }
    return walk(args) as Record<string, unknown>
}

// ── Errors ──────────────────────────────────────────────────────────────────────────────────────

function validation(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.VALIDATION, params: { message } })
}
function notFound(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { message, entityType: 'routine' } })
}

/** Loose UUID/ibId check (avoids a bad-id DB cast when resolving by name). */
function isUuid(s: string): boolean {
    return /^[0-9a-z]{16,}$/i.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}
