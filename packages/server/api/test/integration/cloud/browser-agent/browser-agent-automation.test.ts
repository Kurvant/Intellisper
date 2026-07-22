import { AgentBatchJobStatus, PrincipalType } from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'
import { generateMockToken } from '../../../helpers/auth'
import { mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

/**
 * Automation integration (Phase 8) against a real DB (PGLite) + the real batch/schedule services and
 * routine store. The BullMQ queue + presence Redis are mocked at the module boundary (no infra in
 * tests); everything else — persistence, ownership scoping, counter finalisation — is exercised for
 * real. Covers: batch create persists rows + enqueues; the onRowDone counter/finalisation loop; and
 * cross-user isolation (a user cannot see/cancel another user's batch — the "no leak" red-team).
 */

// Capture enqueue calls (the queue itself is not run in tests).
const enqueued: Array<{ batchJobId: string, routineRunId: string }> = []
vi.mock('../../../../src/app/browser-agent/automation/browser-agent-automation.jobs', () => ({
    batchDeps: {
        enqueueRow: async (batchJobId: string, routineRunId: string) => { enqueued.push({ batchJobId, routineRunId }) },
        dequeueRow: async () => { /* no-op */ },
        notifyWorkAvailable: () => { /* no socket in tests */ },
    },
    scheduleDeps: {
        register: async (scheduleId: string) => `ba-sched:${scheduleId}`,
        deregister: async () => { /* no-op */ },
    },
    registerBrowserAgentAutomationJobs: () => { /* no-op in tests */ },
    setBrowserAgentWorkNudge: () => { /* no-op */ },
}))

// Presence: keep it in-memory so admission/claim logic doesn't touch Redis.
vi.mock('../../../../src/app/browser-agent/automation/presence.service', () => {
    const connected = new Set<string>()
    let inflight = 0
    return {
        browserAgentPresence: () => ({
            heartbeat: async (u: string) => { connected.add(u) },
            clear: async (u: string) => { connected.delete(u) },
            isConnected: async (u: string) => connected.has(u),
            incrInflight: async () => ++inflight,
            decrInflight: async () => { inflight = Math.max(0, inflight - 1) },
            getInflight: async () => inflight,
        }),
    }
})

// Notifier: no email in tests.
vi.mock('../../../../src/app/browser-agent/automation/automation-notifier', () => ({
    browserAgentNotifier: () => ({ batchFinished: async () => { /* no-op */ }, needsAttention: async () => { /* no-op */ } }),
}))

import { repoFactory } from '../../../../src/app/core/db/repo-factory'
import { AgentBatchJobEntity, RoutineEntity, RoutineRunEntity, RoutineStepEntity } from '../../../../src/app/browser-agent/entities'
import { browserAgentBatch } from '../../../../src/app/browser-agent/automation/browser-agent-batch.service'
import { batchDeps } from '../../../../src/app/browser-agent/automation/browser-agent-automation.jobs'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})
afterAll(async () => {
    await teardownTestEnvironment()
})
beforeEach(() => {
    enqueued.length = 0
})

async function setupUser() {
    const { mockOwner, mockPlatform, mockProject } = await mockAndSaveBasicSetup()
    const token = await generateMockToken({ type: PrincipalType.USER, id: mockOwner.id, platform: { id: mockPlatform.id }, projectId: mockProject.id })
    return { token, userId: mockOwner.id, platformId: mockPlatform.id, projectId: mockProject.id }
}

/** Seed a routine directly (record-from-run is covered in Phase 7; here we just need a target). */
async function seedRoutine(scope: { userId: string, platformId: string, projectId: string }, params: unknown[] = []) {
    const routineRepo = repoFactory(RoutineEntity)
    const stepRepo = repoFactory(RoutineStepEntity)
    const id = `r${Math.abs(hash(scope.userId + Date.now().toString()))}`
    const routine = await routineRepo().save(routineRepo().create({
        id, platformId: scope.platformId, userId: scope.userId, projectId: scope.projectId,
        name: 'Test routine', description: null, params, version: 1, deletedAt: null,
    } as never))
    await stepRepo().save(stepRepo().create({ id: `${id}s0`, routineId: id, ordinal: 0, action: 'navigate', locators: { url: 'https://x.com', recordedArgs: { url: 'https://x.com' } }, intent: 'go', config: null } as never))
    return (routine as { id: string }).id
}

function hash(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return h
}

async function post(path: string, token: string, body: Record<string, unknown>) {
    return app!.inject({ method: 'POST', url: `/api/v1${path}`, headers: { authorization: `Bearer ${token}` }, body })
}
async function get(path: string, token: string) {
    return app!.inject({ method: 'GET', url: `/api/v1${path}`, headers: { authorization: `Bearer ${token}` } })
}

describe('Automation — batch create + persistence', () => {
    it('creates a batch, persists one row per param set, and enqueues each row', async () => {
        const { token, userId, platformId, projectId } = await setupUser()
        const routineId = await seedRoutine({ userId, platformId, projectId })
        const res = await post('/browser-agent/automation/batches', token, {
            projectId, routineId, rows: [{ q: 'a' }, { q: 'b' }, { q: 'c' }],
        })
        expect(res.statusCode).toBe(StatusCodes.OK)
        const body = res.json()
        expect(body.rowsTotal).toBe(3)
        expect(body.status).toBe(AgentBatchJobStatus.PENDING)
        // Rows persisted + enqueued.
        const rows = await repoFactory(RoutineRunEntity)().find({ where: { batchJobId: body.id } })
        expect(rows).toHaveLength(3)
        expect(enqueued).toHaveLength(3)
    })

    it('rejects a batch whose rows miss a required param (before enqueue)', async () => {
        const { token, userId, platformId, projectId } = await setupUser()
        const routineId = await seedRoutine({ userId, platformId, projectId }, [{ name: 'q', label: 'Q', type: 'TEXT', required: true, options: null, default: null }])
        const res = await post('/browser-agent/automation/batches', token, { projectId, routineId, rows: [{ q: 'a' }, { nope: 'x' }] })
        expect(res.statusCode).toBeGreaterThanOrEqual(400)
        expect(enqueued).toHaveLength(0)
    })
})

describe('Automation — onRowDone counter/finalisation loop (real DB)', () => {
    it('advances rowsCompleted/rowsFailed atomically and finalises COMPLETED_WITH_ERRORS', async () => {
        const { userId, platformId, projectId } = await setupUser()
        const routineId = await seedRoutine({ userId, platformId, projectId })
        const scope = { userId, platformId, projectId }
        const batch = await browserAgentBatch(app!.log, batchDeps).create(scope, { routineId, paramSets: [{ q: 'a' }, { q: 'b' }] })

        // Simulate two rows terminating: one success, one failure → COMPLETED_WITH_ERRORS.
        await browserAgentBatch(app!.log, batchDeps).onRowDone(batch.id, 'run1', true)
        await browserAgentBatch(app!.log, batchDeps).onRowDone(batch.id, 'run2', false)

        const fresh = await repoFactory(AgentBatchJobEntity)().findOneBy({ id: batch.id })
        expect(fresh?.rowsCompleted).toBe(1)
        expect(fresh?.rowsFailed).toBe(1)
        expect(fresh?.status).toBe(AgentBatchJobStatus.COMPLETED_WITH_ERRORS)
        expect(fresh?.endedAt).toBeTruthy()
    })

    it('finalises COMPLETED when all rows succeed', async () => {
        const { userId, platformId, projectId } = await setupUser()
        const routineId = await seedRoutine({ userId, platformId, projectId })
        const scope = { userId, platformId, projectId }
        const batch = await browserAgentBatch(app!.log, batchDeps).create(scope, { routineId, paramSets: [{ q: 'a' }] })
        await browserAgentBatch(app!.log, batchDeps).onRowDone(batch.id, 'run1', true)
        const fresh = await repoFactory(AgentBatchJobEntity)().findOneBy({ id: batch.id })
        expect(fresh?.status).toBe(AgentBatchJobStatus.COMPLETED)
    })
})

describe('Automation — cross-user isolation (red-team)', () => {
    it('a user CANNOT see or cancel another user\'s batch (no leak)', async () => {
        // User A creates a batch.
        const a = await setupUser()
        const routineId = await seedRoutine({ userId: a.userId, platformId: a.platformId, projectId: a.projectId })
        const created = await post('/browser-agent/automation/batches', a.token, { projectId: a.projectId, routineId, rows: [{ q: 'a' }] })
        const batchId = created.json().id

        // User B (a different platform+user) tries to read + cancel it.
        const b = await setupUser()
        const readAsB = await get(`/browser-agent/automation/batches/${batchId}?projectId=${b.projectId}`, b.token)
        expect(readAsB.statusCode).toBeGreaterThanOrEqual(400) // not found for B

        const cancelAsB = await post(`/browser-agent/automation/batches/${batchId}/cancel`, b.token, { projectId: b.projectId })
        expect(cancelAsB.statusCode).toBeGreaterThanOrEqual(400)

        // A's batch is untouched.
        const readAsA = await get(`/browser-agent/automation/batches/${batchId}?projectId=${a.projectId}`, a.token)
        expect(readAsA.statusCode).toBe(StatusCodes.OK)
        expect(readAsA.json().batch.status).toBe(AgentBatchJobStatus.PENDING)
    })

    it('B\'s batch list never includes A\'s batch', async () => {
        const a = await setupUser()
        const routineId = await seedRoutine({ userId: a.userId, platformId: a.platformId, projectId: a.projectId })
        const created = await post('/browser-agent/automation/batches', a.token, { projectId: a.projectId, routineId, rows: [{ q: 'a' }] })
        const batchId = created.json().id

        const b = await setupUser()
        const listB = await get(`/browser-agent/automation/batches?projectId=${b.projectId}`, b.token)
        expect(listB.statusCode).toBe(StatusCodes.OK)
        expect((listB.json().batches as Array<{ id: string }>).some((x) => x.id === batchId)).toBe(false)
    })
})
