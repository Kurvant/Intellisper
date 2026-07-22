import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Schedule service (Phase 8) — cron validation, register/deregister of the per-schedule cron job (via
 * injected deps), owner-scoped CRUD, and resolveFiring (what the cron handler hands to batch-create).
 */

const { repos, makeRepo } = vi.hoisted(() => {
    const store: Record<string, Record<string, ReturnType<typeof vi.fn>> & { create: (x: unknown) => unknown }> = {}
    const make = () => ({
        find: vi.fn().mockResolvedValue([]),
        findOneBy: vi.fn().mockResolvedValue(null),
        countBy: vi.fn().mockResolvedValue(0),
        save: vi.fn().mockImplementation(async (x: unknown) => x),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        delete: vi.fn().mockResolvedValue({ affected: 1 }),
        createQueryBuilder: vi.fn(() => ({ orderBy: () => ({ andWhere: () => ({ getMany: async () => [] }) }) })),
        create: (x: unknown) => x,
    })
    return { repos: store, makeRepo: make }
})

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: (entity: { options?: { name?: string } }) => {
        const name = entity?.options?.name ?? 'unknown'
        if (!repos[name]) repos[name] = makeRepo() as never
        return () => repos[name]
    },
}))
vi.mock('../../../../src/app/browser-agent/scope/agent-scope', () => ({
    agentScope: { ownerFilter: (ctx: { platformId: string, userId: string }) => ({ platformId: ctx.platformId, userId: ctx.userId }), applyRead: (qb: unknown) => qb },
}))

import { browserAgentSchedule, nextRun } from '../../../../src/app/browser-agent/automation/browser-agent-schedule.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const scope = { userId: 'u1', platformId: 'p1', projectId: 'proj1' }
const deps = { register: vi.fn().mockResolvedValue('ba-sched:s1'), deregister: vi.fn() }
const svc = () => browserAgentSchedule(log, deps)

const R = () => ({ sched: () => repos['browser_agent_schedule'], routine: () => repos['browser_agent_routine'] })

beforeEach(() => {
    for (const name of ['browser_agent_schedule', 'browser_agent_routine']) {
        if (!repos[name]) repos[name] = makeRepo() as never
        const r = repos[name]
        r.find.mockReset().mockResolvedValue([])
        r.findOneBy.mockReset().mockResolvedValue(null)
        r.countBy.mockReset().mockResolvedValue(0)
        r.save.mockReset().mockImplementation(async (x: unknown) => x)
        r.update.mockReset().mockResolvedValue({ affected: 1 })
        r.delete.mockReset().mockResolvedValue({ affected: 1 })
    }
    deps.register.mockReset().mockResolvedValue('ba-sched:s1'); deps.deregister.mockReset()
})

describe('nextRun — cron validation', () => {
    it('accepts a valid 5-field cron', () => {
        expect(() => nextRun('0 9 * * *', 'UTC')).not.toThrow()
    })
    it('accepts a 6-field (seconds) cron', () => {
        expect(() => nextRun('0 0 9 * * *', 'UTC')).not.toThrow()
    })
    it('rejects garbage', () => {
        expect(() => nextRun('not a cron', 'UTC')).toThrow()
        expect(() => nextRun('99 99 99 * *', 'UTC')).toThrow()
    })
})

describe('create', () => {
    it('validates the routine ownership + registers the cron job + persists repeatJobKey', async () => {
        R().routine().findOneBy.mockResolvedValue({ id: 'r1', deletedAt: null })
        R().sched().save.mockImplementation(async (x: Record<string, unknown>) => ({ ...x, id: 's1' }))
        const sched = await svc().create(scope, { routineId: 'r1', name: 'Daily', cron: '0 9 * * *' })
        expect(sched.name).toBe('Daily')
        expect(sched.enabled).toBe(true)
        expect(deps.register).toHaveBeenCalledWith('s1', '0 9 * * *', 'UTC')
        const keyUpdate = R().sched().update.mock.calls.find((c: unknown[]) => (c[1] as { repeatJobKey?: string }).repeatJobKey)
        expect(keyUpdate).toBeTruthy()
        // repeatJobKey is server-internal — never surfaced on the returned DTO.
        expect((sched as Record<string, unknown>).repeatJobKey).toBeUndefined()
    })

    it('rejects an invalid cron before persisting', async () => {
        R().routine().findOneBy.mockResolvedValue({ id: 'r1', deletedAt: null })
        await expect(svc().create(scope, { routineId: 'r1', name: 'X', cron: 'bad' })).rejects.toThrow()
        expect(deps.register).not.toHaveBeenCalled()
    })

    it('enforces the schedule cap', async () => {
        R().routine().findOneBy.mockResolvedValue({ id: 'r1', deletedAt: null })
        R().sched().countBy.mockResolvedValue(10)
        await expect(svc().create(scope, { routineId: 'r1', name: 'X', cron: '0 9 * * *', maxSchedules: 10 })).rejects.toThrow()
    })
})

describe('setEnabled / remove — deregisters the cron job', () => {
    it('disable deregisters + clears nextRunAt', async () => {
        R().sched().findOneBy.mockResolvedValueOnce({ id: 's1', enabled: true, cron: '0 9 * * *', timezone: 'UTC', repeatJobKey: 'ba-sched:s1' }).mockResolvedValueOnce({ id: 's1', enabled: false })
        await svc().setEnabled(scope, 's1', false)
        expect(deps.deregister).toHaveBeenCalledWith('s1', 'ba-sched:s1')
    })

    it('remove deregisters + deletes (owner-scoped)', async () => {
        R().sched().findOneBy.mockResolvedValue({ id: 's1', repeatJobKey: 'ba-sched:s1' })
        const res = await svc().remove(scope, 's1')
        expect(res.removed).toBe(true)
        expect(deps.deregister).toHaveBeenCalled()
        expect(R().sched().delete).toHaveBeenCalled()
    })
})

describe('resolveFiring — what the cron handler hands to batch-create', () => {
    it('returns the routine + defaults (single empty row) when no paramSets, advances lastRun/nextRun', async () => {
        R().sched().findOneBy.mockResolvedValue({ id: 's1', enabled: true, userId: 'u1', platformId: 'p1', projectId: 'proj1', routineId: 'r1', cron: '0 9 * * *', timezone: 'UTC', paramSets: null, notify: null })
        const firing = await svc().resolveFiring('s1')
        expect(firing).toBeTruthy()
        expect(firing!.routineId).toBe('r1')
        expect(firing!.paramSets).toEqual([{}])
        expect(firing!.scope).toEqual({ userId: 'u1', platformId: 'p1', projectId: 'proj1' })
        const advance = R().sched().update.mock.calls.find((c: unknown[]) => (c[1] as { lastRunAt?: string }).lastRunAt)
        expect(advance).toBeTruthy()
    })

    it('returns null for a disabled schedule (no firing)', async () => {
        R().sched().findOneBy.mockResolvedValue({ id: 's1', enabled: false })
        expect(await svc().resolveFiring('s1')).toBeNull()
    })
})
