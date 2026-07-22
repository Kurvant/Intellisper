import { AgentBatchJobStatus, RoutineRunStatus } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Batch service (Phase 8) — functional tests for the create→enqueue path, required-param validation,
 * cap enforcement, and the onRowDone counter/finalisation STATE MACHINE (atomic increment →
 * COMPLETED / FAILED / COMPLETED_WITH_ERRORS). Repos + presence + injected deps are mocked; the
 * mutable batch double lets counters round-trip like Postgres.
 */

const { repos, makeRepo, presenceDecr, presenceInflight } = vi.hoisted(() => {
    const store: Record<string, Record<string, ReturnType<typeof vi.fn>> & { create: (x: unknown) => unknown }> = {}
    const make = () => ({
        find: vi.fn().mockResolvedValue([]),
        findOneBy: vi.fn().mockResolvedValue(null),
        countBy: vi.fn().mockResolvedValue(0),
        save: vi.fn().mockImplementation(async (x: unknown) => x),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        increment: vi.fn().mockResolvedValue({ affected: 1 }),
        createQueryBuilder: vi.fn(),
        create: (x: unknown) => x,
    })
    return { repos: store, makeRepo: make, presenceDecr: vi.fn(), presenceInflight: vi.fn().mockResolvedValue(0) }
})

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: (entity: { options?: { name?: string } }) => {
        const name = entity?.options?.name ?? 'unknown'
        if (!repos[name]) repos[name] = makeRepo() as never
        return () => repos[name]
    },
}))
vi.mock('../../../../src/app/browser-agent/scope/agent-scope', () => ({
    agentScope: {
        ownerFilter: (ctx: { platformId: string, userId: string }) => ({ platformId: ctx.platformId, userId: ctx.userId }),
        applyRead: (qb: unknown) => qb,
    },
}))
vi.mock('../../../../src/app/browser-agent/automation/presence.service', () => ({
    browserAgentPresence: () => ({ decrInflight: presenceDecr, getInflight: presenceInflight, incrInflight: vi.fn(), isConnected: vi.fn(), heartbeat: vi.fn(), clear: vi.fn() }),
}))
const notifierFinished = vi.fn()
vi.mock('../../../../src/app/browser-agent/automation/automation-notifier', () => ({
    browserAgentNotifier: () => ({ batchFinished: notifierFinished, needsAttention: vi.fn() }),
}))

import { browserAgentBatch } from '../../../../src/app/browser-agent/automation/browser-agent-batch.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const scope = { userId: 'u1', platformId: 'p1', projectId: 'proj1' }
const deps = { enqueueRow: vi.fn(), dequeueRow: vi.fn(), notifyWorkAvailable: vi.fn() }
const svc = () => browserAgentBatch(log, deps)

const R = () => ({
    batch: () => repos['browser_agent_batch_job'],
    routine: () => repos['browser_agent_routine'],
    run: () => repos['browser_agent_routine_run'],
})

const NAMES = ['browser_agent_batch_job', 'browser_agent_routine', 'browser_agent_routine_run']
beforeEach(() => {
    for (const name of NAMES) {
        if (!repos[name]) repos[name] = makeRepo() as never
        const r = repos[name]
        r.find.mockReset().mockResolvedValue([])
        r.findOneBy.mockReset().mockResolvedValue(null)
        r.countBy.mockReset().mockResolvedValue(0)
        r.save.mockReset().mockImplementation(async (x: unknown) => x)
        r.update.mockReset().mockResolvedValue({ affected: 1 })
        r.increment.mockReset().mockResolvedValue({ affected: 1 })
    }
    deps.enqueueRow.mockReset(); deps.dequeueRow.mockReset(); deps.notifyWorkAvailable.mockReset()
    presenceDecr.mockReset(); presenceInflight.mockReset().mockResolvedValue(0); notifierFinished.mockReset()
})

describe('create', () => {
    it('persists a batch + one row per param set, enqueues each, nudges presence', async () => {
        R().routine().findOneBy.mockResolvedValue({ id: 'r1', deletedAt: null, params: [] })
        let savedRows: unknown[] = []
        R().run().save.mockImplementation(async (rows: unknown[]) => { savedRows = rows as unknown[]; return rows })
        const batch = await svc().create(scope, { routineId: 'r1', paramSets: [{ a: 1 }, { a: 2 }, { a: 3 }] })
        expect(batch.rowsTotal).toBe(3)
        expect(batch.status).toBe(AgentBatchJobStatus.PENDING)
        expect(savedRows).toHaveLength(3)
        expect(deps.enqueueRow).toHaveBeenCalledTimes(3)
        expect(deps.notifyWorkAvailable).toHaveBeenCalledWith('u1')
    })

    it('rejects a missing required param up-front (before enqueue)', async () => {
        R().routine().findOneBy.mockResolvedValue({ id: 'r1', deletedAt: null, params: [{ name: 'email', required: true }] })
        await expect(svc().create(scope, { routineId: 'r1', paramSets: [{ email: 'a@b.com' }, { email: '' }] })).rejects.toThrow()
        expect(deps.enqueueRow).not.toHaveBeenCalled()
    })

    it('enforces the per-plan row cap', async () => {
        R().routine().findOneBy.mockResolvedValue({ id: 'r1', deletedAt: null, params: [] })
        await expect(svc().create(scope, { routineId: 'r1', paramSets: [{ a: 1 }, { a: 2 }], caps: { maxBatchRows: 1, maxConcurrentRows: 1 } })).rejects.toThrow()
    })

    it('rejects a routine that is not owned', async () => {
        R().routine().findOneBy.mockResolvedValue(null)
        await expect(svc().create(scope, { routineId: 'rX', paramSets: [{ a: 1 }] })).rejects.toThrow()
    })
})

describe('onRowDone — counter finalisation state machine', () => {
    // A mutable batch row the increment + re-read round-trips through.
    function seedBatch(partial: Record<string, unknown>) {
        const batch = { id: 'b1', userId: 'u1', platformId: 'p1', projectId: 'proj1', rowsTotal: 2, rowsCompleted: 0, rowsFailed: 0, status: AgentBatchJobStatus.RUNNING, concurrency: 1, ...partial }
        R().batch().findOneBy.mockImplementation(async () => ({ ...batch }))
        R().batch().increment.mockImplementation(async (_w: unknown, field: string) => { (batch as Record<string, number>)[field] += 1; return { affected: 1 } })
        return batch
    }

    it('releases the concurrency slot on every terminal row', async () => {
        seedBatch({})
        await svc().onRowDone('b1', 'run1', true)
        expect(presenceDecr).toHaveBeenCalledWith('u1')
    })

    it('finalises COMPLETED when all rows succeed', async () => {
        const batch = seedBatch({ rowsTotal: 2, rowsCompleted: 1 })
        await svc().onRowDone('b1', 'run2', true) // 2nd success → done
        expect(batch.rowsCompleted).toBe(2)
        const finalUpdate = R().batch().update.mock.calls.find((c: unknown[]) => (c[1] as { status?: string }).status === AgentBatchJobStatus.COMPLETED)
        expect(finalUpdate).toBeTruthy()
        expect(notifierFinished).toHaveBeenCalledWith('b1')
    })

    it('finalises COMPLETED_WITH_ERRORS on a mix', async () => {
        const batch = seedBatch({ rowsTotal: 2, rowsCompleted: 1, rowsFailed: 0 })
        await svc().onRowDone('b1', 'run2', false) // 1 ok + 1 failed → partial
        expect(batch.rowsFailed).toBe(1)
        const finalUpdate = R().batch().update.mock.calls.find((c: unknown[]) => (c[1] as { status?: string }).status === AgentBatchJobStatus.COMPLETED_WITH_ERRORS)
        expect(finalUpdate).toBeTruthy()
    })

    it('finalises FAILED when every row failed', async () => {
        const batch = seedBatch({ rowsTotal: 1, rowsCompleted: 0, rowsFailed: 0 })
        await svc().onRowDone('b1', 'run1', false)
        expect(batch.rowsFailed).toBe(1)
        const finalUpdate = R().batch().update.mock.calls.find((c: unknown[]) => (c[1] as { status?: string }).status === AgentBatchJobStatus.FAILED)
        expect(finalUpdate).toBeTruthy()
    })

    it('does NOT finalise while rows remain', async () => {
        seedBatch({ rowsTotal: 3, rowsCompleted: 0 })
        await svc().onRowDone('b1', 'run1', true) // 1/3 → keep running
        expect(notifierFinished).not.toHaveBeenCalled()
    })
})

describe('cancel + retryFailed', () => {
    it('cancel dequeues pending rows and marks the batch CANCELED', async () => {
        R().batch().findOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', platformId: 'p1', status: AgentBatchJobStatus.RUNNING })
        R().run().find.mockResolvedValue([{ id: 'row1' }, { id: 'row2' }])
        const res = await svc().cancel(scope, 'b1')
        expect(res.canceled).toBe(true)
        expect(deps.dequeueRow).toHaveBeenCalledTimes(2)
        const upd = R().batch().update.mock.calls.find((c: unknown[]) => (c[1] as { status?: string }).status === AgentBatchJobStatus.CANCELED)
        expect(upd).toBeTruthy()
    })

    it('cancel is a no-op on an already-terminal batch', async () => {
        R().batch().findOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', platformId: 'p1', status: AgentBatchJobStatus.COMPLETED })
        const res = await svc().cancel(scope, 'b1')
        expect(res.canceled).toBe(false)
    })

    it('retryFailed re-enqueues only the failed rows', async () => {
        R().batch().findOneBy.mockResolvedValue({ id: 'b1', userId: 'u1', platformId: 'p1', rowsFailed: 2, status: AgentBatchJobStatus.COMPLETED_WITH_ERRORS })
        R().run().find.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }])
        const res = await svc().retryFailed(scope, 'b1')
        expect(res.requeued).toBe(2)
        expect(deps.enqueueRow).toHaveBeenCalledTimes(2)
    })
})
