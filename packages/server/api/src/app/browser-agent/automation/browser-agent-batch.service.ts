import {
    AgentBatchJob,
    AgentBatchJobStatus,
    AgentSharableResourceType,
    type AgentVisibilityContext,
    ErrorCode,
    ibId,
    IntellisperError,
    isNil,
    type RoutineRun,
    RoutineRunStatus,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { AgentBatchJobEntity, RoutineEntity, RoutineRunEntity } from '../entities'
import { type RoutineScope } from '../routine/browser-agent-routine.service'
import { agentScope } from '../scope/agent-scope'
import { browserAgentTenancyService } from '../tenancy/browser-agent-tenancy.service'
import { browserAgentNotifier } from './automation-notifier'
import { browserAgentPresence } from './presence.service'

/**
 * Batch service — run one routine across many parameter sets, each row a `browser_agent_routine_run`
 * child of a `browser_agent_batch_job`, executed by the deterministic replay engine on the user's
 * LIVE session (via the connected extension; offline → the row waits, never headless).
 *
 * Integration seams:
 *  - Rows are enqueued as one-time `BROWSER_AGENT_BATCH_ROW` system jobs (the admission tick — see
 *    browser-agent-automation.jobs.ts); `enqueueRow` is injected so this service doesn't import the
 *    system-jobs queue directly (keeps it unit-testable + decoupled).
 *  - `onRowDone` is wired from the runtime (via the module) so the runtime advances parent counters
 *    + releases the concurrency slot when a row reaches terminal — the SAME decoupling the source
 *    product uses (`runtime.onBatchRowDone`).
 *  - Every read/write is owner-scoped through `agentScope`.
 */

const batchRepo = repoFactory(AgentBatchJobEntity)
const routineRunRepo = repoFactory(RoutineRunEntity)
const routineRepo = repoFactory(RoutineEntity)

export type BatchScope = RoutineScope

/** Injected side effects (queue + presence nudge) so the service stays decoupled + testable. */
export type BatchDeps = {
    /** Enqueue a one-time admission tick for a row (jobId = routineRunId → idempotent re-enqueue). */
    enqueueRow: (batchJobId: string, routineRunId: string) => Promise<void>
    /** Remove a still-queued row's admission job (cancel). Best-effort. */
    dequeueRow: (routineRunId: string) => Promise<void>
    /** Nudge the connected extension that work is available (best-effort). */
    notifyWorkAvailable: (userId: string) => void
}

export type CreateBatchInput = {
    routineId: string
    paramSets: Record<string, unknown>[]
    concurrency?: number
    notify?: Record<string, unknown> | null
    scheduleId?: string | null
    /** The per-plan caps (from entitlements; Phase 9 supplies real values, default generous now). */
    caps?: { maxBatchRows: number, maxConcurrentRows: number }
}

const DEFAULT_CAPS = { maxBatchRows: 500, maxConcurrentRows: 3 }

function visibility(scope: BatchScope, sharingUnlocked: boolean): AgentVisibilityContext {
    return { platformId: scope.platformId, userId: scope.userId, sharingUnlocked }
}

function validation(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.VALIDATION, params: { message } })
}
function notFound(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { message, entityType: 'batch' } })
}
function forbidden(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.AUTHORIZATION, params: { message } })
}

export const browserAgentBatch = (log: FastifyBaseLogger, deps: BatchDeps) => ({
    /** Create a batch: validate routine ownership + caps + required params, persist rows, enqueue. */
    async create(scope: BatchScope, input: CreateBatchInput): Promise<AgentBatchJob> {
        const rows = input.paramSets ?? []
        if (!rows.length) throw validation('Provide at least one row of parameters.')

        // Routine must exist + belong to the caller (owner-scoped).
        const routine = await routineRepo().findOneBy({ id: input.routineId, ...agentScope.ownerFilter(scope) })
        if (isNil(routine) || !isNil(routine.deletedAt)) throw notFound('Routine not found.')

        const caps = input.caps ?? DEFAULT_CAPS
        if (caps.maxBatchRows <= 0) throw forbidden('Your plan does not include batch automation. Upgrade to run batches.')
        if (rows.length > caps.maxBatchRows) throw validation(`This batch has ${rows.length} rows, which exceeds your plan limit of ${caps.maxBatchRows}.`)
        const concurrency = Math.max(1, Math.min(input.concurrency ?? 1, caps.maxConcurrentRows || 1))

        // Fast, friendly up-front check that rows supply the routine's REQUIRED params (buildReplayPlan
        // re-validates per row at run time; this catches a whole-batch mistake before enqueueing).
        const required = (routine.params ?? []).filter((p) => p?.required).map((p) => String(p.name))
        if (required.length) {
            const firstMissing = rows.findIndex((r) => required.some((k) => r[k] === undefined || r[k] === null || String(r[k]).trim() === ''))
            if (firstMissing >= 0) {
                throw validation(`Row ${firstMissing + 1} is missing required value(s): ${required.join(', ')}.`)
            }
        }

        const batch = await batchRepo().save(batchRepo().create({
            id: ibId(),
            platformId: scope.platformId,
            userId: scope.userId,
            projectId: scope.projectId,
            routineId: routine.id,
            scheduleId: input.scheduleId ?? null,
            status: AgentBatchJobStatus.PENDING,
            rowsTotal: rows.length,
            rowsCompleted: 0,
            rowsFailed: 0,
            concurrency,
            paramSets: rows,
            notify: input.notify ?? null,
            startedAt: null,
            endedAt: null,
        }))

        // One routine_run child per row (thin history; execution rides a fresh AgentRun per row).
        const children = rows.map((paramValues, rowIndex) => routineRunRepo().create({
            id: ibId(),
            routineId: routine.id,
            platformId: scope.platformId,
            userId: scope.userId,
            projectId: scope.projectId,
            batchJobId: batch.id,
            rowIndex,
            paramValues,
            agentRunId: null,
            status: RoutineRunStatus.PENDING,
            progress: { stepsTotal: 0, stepsCompleted: 0 },
            startedAt: null,
            endedAt: null,
        }))
        const saved = await routineRunRepo().save(children)

        // Enqueue each row's admission tick (idempotent on jobId = routineRunId).
        await Promise.all(saved.map((row) => deps.enqueueRow(batch.id, row.id)))
        // Nudge the extension if already connected (else the rows wait for it).
        deps.notifyWorkAvailable(scope.userId)
        return batch
    },

    /** List the caller's batches (most recent first). Owner-scoped, plus shared batches when the
     *  platform admin has unlocked sharing and the owner opted in (resolved via the tenancy service). */
    async list(scope: BatchScope, limit = 50): Promise<AgentBatchJob[]> {
        const sharingUnlocked = await browserAgentTenancyService(log).isSharingUnlocked(scope.platformId)
        const qb = batchRepo().createQueryBuilder('b').orderBy('b.created', 'DESC').take(Math.min(limit, 100))
        agentScope.applyRead(qb, AgentSharableResourceType.BATCH, visibility(scope, sharingUnlocked), { alias: 'b' })
        return qb.getMany()
    },

    /** Batch detail + its per-row statuses (owner-scoped). */
    async get(scope: BatchScope, batchId: string): Promise<{ batch: AgentBatchJob, rows: RoutineRun[] }> {
        const batch = await batchRepo().findOneBy({ id: batchId, ...agentScope.ownerFilter(scope) })
        if (isNil(batch)) throw notFound('Batch not found.')
        const rows = await routineRunRepo().find({ where: { batchJobId: batch.id }, order: { rowIndex: 'ASC' } })
        return { batch, rows }
    },

    /** Cancel a batch: stop pending rows; running rows finish their current step. */
    async cancel(scope: BatchScope, batchId: string): Promise<{ canceled: boolean }> {
        const batch = await batchRepo().findOneBy({ id: batchId, ...agentScope.ownerFilter(scope) })
        if (isNil(batch)) throw notFound('Batch not found.')
        if (isTerminal(batch.status)) return { canceled: false }

        const pending = await routineRunRepo().find({ where: { batchJobId: batch.id, status: RoutineRunStatus.PENDING } })
        await Promise.all(pending.map((r) => deps.dequeueRow(r.id)))
        if (pending.length) {
            await routineRunRepo().update({ batchJobId: batch.id, status: RoutineRunStatus.PENDING }, { status: RoutineRunStatus.FAILED })
        }
        await batchRepo().update({ id: batch.id }, { status: AgentBatchJobStatus.CANCELED, endedAt: new Date().toISOString() })
        return { canceled: true }
    },

    /** Re-run only the FAILED rows of a batch (idempotent re-enqueue). */
    async retryFailed(scope: BatchScope, batchId: string): Promise<{ requeued: number }> {
        const batch = await batchRepo().findOneBy({ id: batchId, ...agentScope.ownerFilter(scope) })
        if (isNil(batch)) throw notFound('Batch not found.')
        const failed = await routineRunRepo().find({ where: { batchJobId: batch.id, status: RoutineRunStatus.FAILED } })
        if (!failed.length) return { requeued: 0 }
        await routineRunRepo().update({ id: In(failed.map((r) => r.id)) }, { status: RoutineRunStatus.PENDING, agentRunId: null })
        await batchRepo().update({ id: batch.id }, {
            status: AgentBatchJobStatus.RUNNING,
            rowsFailed: Math.max(0, batch.rowsFailed - failed.length),
        })
        await Promise.all(failed.map((row) => deps.enqueueRow(batch.id, row.id)))
        deps.notifyWorkAvailable(scope.userId)
        return { requeued: failed.length }
    },

    /**
     * Called by the runtime when a batch ROW reaches terminal. Advances the parent counters with an
     * ATOMIC increment (no read-modify-write → safe under concurrency), releases the user's
     * concurrency slot, finalises the batch when all rows are accounted for, and fires the completion
     * notification. Best-effort; each row terminal transition fires this once. NOT owner-scoped
     * (called by the trusted runtime with the row's own batch id, never a client).
     */
    async onRowDone(batchJobId: string, _agentRunId: string, succeeded: boolean): Promise<void> {
        const batch = await batchRepo().findOneBy({ id: batchJobId })
        if (isNil(batch)) return
        // Release the user's in-flight slot so the next row can be admitted.
        await browserAgentPresence(log).decrInflight(batch.userId)

        // Atomic counter bump (single round-trip; safe across concurrent rows/instances).
        await batchRepo().increment({ id: batchJobId }, succeeded ? 'rowsCompleted' : 'rowsFailed', 1)

        const fresh = await batchRepo().findOneBy({ id: batchJobId })
        if (isNil(fresh)) return
        const done = fresh.rowsCompleted + fresh.rowsFailed
        if (done >= fresh.rowsTotal && !isTerminal(fresh.status)) {
            const status = fresh.rowsFailed === 0 ? AgentBatchJobStatus.COMPLETED
                : fresh.rowsCompleted === 0 ? AgentBatchJobStatus.FAILED
                    : AgentBatchJobStatus.COMPLETED_WITH_ERRORS
            await batchRepo().update({ id: batchJobId }, { status, endedAt: new Date().toISOString() })
            // Best-effort completion email (honours the batch's notify prefs).
            void browserAgentNotifier(log).batchFinished(batchJobId)
        }
        else if (fresh.status === AgentBatchJobStatus.PAUSED_WAITING_EXTENSION) {
            await batchRepo().update({ id: batchJobId }, { status: AgentBatchJobStatus.RUNNING })
        }
        // Keep the next queued row moving.
        deps.notifyWorkAvailable(batch.userId)
    },

    /** Aggregate the rows' extracted output for export (an array of records). */
    async exportOutput(scope: BatchScope, batchId: string): Promise<Record<string, unknown>[]> {
        const { rows } = await this.get(scope, batchId)
        const out: Record<string, unknown>[] = []
        for (const r of rows) {
            const o = (r.progress as { output?: unknown })?.output
            if (Array.isArray(o)) out.push(...(o as Record<string, unknown>[]))
            else if (o && typeof o === 'object') out.push(o as Record<string, unknown>)
        }
        return out
    },
})

function isTerminal(status: AgentBatchJobStatus): boolean {
    return status === AgentBatchJobStatus.COMPLETED
        || status === AgentBatchJobStatus.COMPLETED_WITH_ERRORS
        || status === AgentBatchJobStatus.CANCELED
        || status === AgentBatchJobStatus.FAILED
}
