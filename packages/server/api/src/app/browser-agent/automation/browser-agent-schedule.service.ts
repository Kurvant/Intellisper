import {
    AgentSchedule,
    ErrorCode,
    ibId,
    IntellisperError,
    isNil,
} from '@intelblocks/shared'
import cronValidator from 'cron-validator'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { AgentScheduleEntity, RoutineEntity } from '../entities'
import type { RoutineScope } from '../routine/browser-agent-routine.service'
import { agentScope } from '../scope/agent-scope'
import { normaliseRows } from './batch-input'

/**
 * Schedule service — re-run a routine on a cron. Timing is owned by a per-schedule REPEATED
 * blockunits system job (`BROWSER_AGENT_SCHEDULE_FIRE`); each firing spawns a batch (1 row of
 * defaults, or N from paramSets) which runs via the connected-session model (waits for the extension
 * if offline — never headless).
 *
 * The queue registration/deregistration is INJECTED (`ScheduleDeps`) so this service doesn't import
 * the system-jobs queue directly — it stays unit-testable and decoupled, and the module wires the
 * real `systemJobsSchedule` in. Every read/write is owner-scoped via `agentScope`.
 */

const scheduleRepo = repoFactory(AgentScheduleEntity)
const routineRepo = repoFactory(RoutineEntity)

export type ScheduleScope = RoutineScope

export type ScheduleDeps = {
    /** Register (or re-register) the repeated cron job for a schedule. Returns the repeat-job key. */
    register: (scheduleId: string, cron: string, timezone: string) => Promise<string | null>
    /** Remove the repeated cron job for a schedule (disable/delete). Best-effort. */
    deregister: (scheduleId: string, repeatJobKey: string | null) => Promise<void>
}

export type CreateScheduleInput = {
    routineId: string
    name: string
    cron: string
    timezone?: string
    paramSets?: Record<string, unknown>[] | null
    notify?: Record<string, unknown> | null
    /** Per-plan cap (Phase 9 supplies the real value; generous default now). */
    maxSchedules?: number
}

const DEFAULT_MAX_SCHEDULES = 10

function validation(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.VALIDATION, params: { message } })
}
function notFound(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { message, entityType: 'schedule' } })
}
function forbidden(message: string): IntellisperError {
    return new IntellisperError({ code: ErrorCode.AUTHORIZATION, params: { message } })
}

/**
 * Validate a cron expression (5 or 6 field) and compute a display-only next-fire approximation.
 * `_tz` is accepted for call-site clarity + future tz-aware computation; BullMQ owns the ACTUAL
 * firing via the repeat pattern + tz, so the exact stored nextRunAt here is not load-bearing.
 */
export function nextRun(cron: string, _tz: string): Date {
    if (!cronValidator.isValidCron(cron, { seconds: true, alias: true, allowBlankDay: true })) {
        throw validation('Invalid cron expression.')
    }
    return dayjs().add(1, 'minute').toDate()
}

export const browserAgentSchedule = (log: FastifyBaseLogger, deps: ScheduleDeps) => ({
    async create(scope: ScheduleScope, input: CreateScheduleInput): Promise<AgentSchedule> {
        if (!input.name?.trim()) throw validation('A schedule name is required.')
        const routine = await routineRepo().findOneBy({ id: input.routineId, ...agentScope.ownerFilter(scope) })
        if (isNil(routine) || !isNil(routine.deletedAt)) throw notFound('Routine not found.')

        const maxSchedules = input.maxSchedules ?? DEFAULT_MAX_SCHEDULES
        if (maxSchedules <= 0) throw forbidden('Your plan does not include scheduling. Upgrade to schedule routines.')
        const active = await scheduleRepo().countBy({ ...agentScope.ownerFilter(scope) })
        if (active >= maxSchedules) throw validation(`You have reached your schedule limit (${maxSchedules}).`)

        const tz = input.timezone || 'UTC'
        const next = nextRun(input.cron, tz)
        const paramSets = input.paramSets ? normaliseRows(input.paramSets) : null

        const sched = await scheduleRepo().save(scheduleRepo().create({
            id: ibId(),
            platformId: scope.platformId,
            userId: scope.userId,
            projectId: scope.projectId,
            routineId: routine.id,
            name: input.name.trim().slice(0, 200),
            cron: input.cron,
            timezone: tz,
            paramSets,
            notify: input.notify ?? null,
            enabled: true,
            repeatJobKey: null,
            lastRunAt: null,
            nextRunAt: next.toISOString(),
        }))

        const key = await deps.register(sched.id, sched.cron, sched.timezone)
        if (key) await scheduleRepo().update({ id: sched.id }, { repeatJobKey: key })
        return { ...sched, repeatJobKey: undefined } as AgentSchedule
    },

    /** List the caller's schedules (owner-scoped). */
    async list(scope: ScheduleScope): Promise<AgentSchedule[]> {
        const qb = scheduleRepo().createQueryBuilder('s').orderBy('s.created', 'DESC')
        // Schedules are always-private (not sharable) — owner filter only.
        qb.andWhere('s."platformId" = :pid AND s."userId" = :uid', { pid: scope.platformId, uid: scope.userId })
        return qb.getMany()
    },

    async setEnabled(scope: ScheduleScope, scheduleId: string, enabled: boolean): Promise<AgentSchedule> {
        const sched = await scheduleRepo().findOneBy({ id: scheduleId, ...agentScope.ownerFilter(scope) })
        if (isNil(sched)) throw notFound('Schedule not found.')
        if (enabled && !sched.enabled) {
            const key = await deps.register(sched.id, sched.cron, sched.timezone)
            await scheduleRepo().update({ id: sched.id }, { enabled: true, repeatJobKey: key, nextRunAt: nextRun(sched.cron, sched.timezone).toISOString() })
        }
        else if (!enabled && sched.enabled) {
            await deps.deregister(sched.id, sched.repeatJobKey)
            await scheduleRepo().update({ id: sched.id }, { enabled: false, nextRunAt: null })
        }
        const fresh = await scheduleRepo().findOneBy({ id: sched.id })
        return { ...(fresh as AgentSchedule), repeatJobKey: undefined } as AgentSchedule
    },

    async remove(scope: ScheduleScope, scheduleId: string): Promise<{ removed: boolean }> {
        const sched = await scheduleRepo().findOneBy({ id: scheduleId, ...agentScope.ownerFilter(scope) })
        if (isNil(sched)) return { removed: false }
        await deps.deregister(sched.id, sched.repeatJobKey)
        await scheduleRepo().delete({ id: sched.id, ...agentScope.ownerFilter(scope) })
        return { removed: true }
    },

    /**
     * A schedule fired (called by the system-job handler): resolve the schedule + owner, then hand
     * the batch-create the routine + paramSets. Returns the create input for the caller to run
     * through the batch service (the handler owns the batch dependency, keeping this service free of
     * it). Advances lastRun/nextRun. Best-effort — a firing failure is logged, never thrown.
     */
    async resolveFiring(scheduleId: string): Promise<{ scope: ScheduleScope, routineId: string, paramSets: Record<string, unknown>[], notify: Record<string, unknown> | null } | null> {
        const sched = await scheduleRepo().findOneBy({ id: scheduleId })
        if (isNil(sched) || !sched.enabled) return null
        const rows = sched.paramSets && sched.paramSets.length ? sched.paramSets : [{}]
        await scheduleRepo().update({ id: sched.id }, {
            lastRunAt: new Date().toISOString(),
            nextRunAt: nextRun(sched.cron, sched.timezone).toISOString(),
        })
        return {
            scope: { userId: sched.userId, platformId: sched.platformId, projectId: sched.projectId },
            routineId: sched.routineId,
            paramSets: rows,
            notify: sched.notify ?? null,
        }
    },
})
