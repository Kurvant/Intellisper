import { ChatConversationStatus, DefaultProjectRole, WorkerJobType } from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as jobQueueModule from '../../../../src/app/workers/job-queue/job-queue'
import { db } from '../../../helpers/db'
import { createMemberContext, createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance
const addSpy = vi.fn().mockResolvedValue({ id: 'mock-job' })

beforeAll(async () => {
    // Fresh env so vi.spyOn on the job-queue module is seen by the server's captured reference.
    app = await setupTestEnvironment({ fresh: true })
    vi.spyOn(jobQueueModule, 'jobQueue').mockImplementation(() => ({
        add: addSpy,
    }) as unknown as ReturnType<typeof jobQueueModule.jobQueue>)
})

afterAll(async () => {
    vi.restoreAllMocks()
    await teardownTestEnvironment()
})

beforeEach(() => {
    addSpy.mockClear()
})

const CONVERSATIONS_URL = '/v1/chat/conversations'

describe('Chat live-turn control plane', () => {
    describe('Send message', () => {
        it('starts a turn: marks STREAMING, enqueues EXECUTE_CHAT_AGENT, returns a runId', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const conversationId = (await ctx.post(CONVERSATIONS_URL, { title: 'Turn' })).json().id

            const response = await ctx.post(`${CONVERSATIONS_URL}/${conversationId}/messages`, {
                content: 'Automate my invoices',
            })

            expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
            expect(typeof response.json().runId).toBe('string')

            expect(addSpy).toHaveBeenCalledTimes(1)
            const enqueued = addSpy.mock.calls[0][0]
            expect(enqueued.data.jobType).toBe(WorkerJobType.EXECUTE_CHAT_AGENT)
            expect(enqueued.data.conversationId).toBe(conversationId)
            expect(enqueued.data.userMessage).toBe('Automate my invoices')
            expect(enqueued.data.projectId).toBeNull()

            const conv = await ctx.get(`${CONVERSATIONS_URL}/${conversationId}`)
            expect(conv.json().status).toBe(ChatConversationStatus.STREAMING)
        })

        it('rejects a second concurrent send while a turn is already streaming', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const conversationId = (await ctx.post(CONVERSATIONS_URL, { title: 'Busy' })).json().id

            const first = await ctx.post(`${CONVERSATIONS_URL}/${conversationId}/messages`, { content: 'first' })
            expect(first.statusCode).toBe(StatusCodes.ACCEPTED)

            const second = await ctx.post(`${CONVERSATIONS_URL}/${conversationId}/messages`, { content: 'second' })
            // A turn is already live — VALIDATION maps to 409 Conflict.
            expect(second.statusCode).toBe(StatusCodes.CONFLICT)
            // Only the first send enqueued a job.
            expect(addSpy).toHaveBeenCalledTimes(1)
        })

        it('allows a new turn once a stale STREAMING conversation is recovered', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const conversationId = (await ctx.post(CONVERSATIONS_URL, { title: 'Recovered' })).json().id

            const staleTs = new Date(Date.now() - 5 * 60 * 1_000).toISOString()
            await db.update('chat_conversation', conversationId, {
                status: ChatConversationStatus.STREAMING,
                updated: staleTs,
            })
            // Reading recovers it to IDLE; a send then succeeds.
            await ctx.get(`${CONVERSATIONS_URL}/${conversationId}`)

            const response = await ctx.post(`${CONVERSATIONS_URL}/${conversationId}/messages`, { content: 'again' })
            expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
        })

        it('returns 404 when sending to another user\'s conversation', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const memberCtx = await createMemberContext(app, ctx, { projectRole: DefaultProjectRole.VIEWER })
            const conversationId = (await ctx.post(CONVERSATIONS_URL, { title: 'Private' })).json().id

            const response = await memberCtx.post(`${CONVERSATIONS_URL}/${conversationId}/messages`, { content: 'hi' })
            expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
            expect(addSpy).not.toHaveBeenCalled()
        })

        it('rejects an empty message with no content and no files', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const conversationId = (await ctx.post(CONVERSATIONS_URL, { title: 'Empty' })).json().id

            const response = await ctx.post(`${CONVERSATIONS_URL}/${conversationId}/messages`, { content: '' })
            expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        })
    })

    describe('Cancel turn', () => {
        it('cancels the caller\'s conversation (204) and 404s for another user', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const memberCtx = await createMemberContext(app, ctx, { projectRole: DefaultProjectRole.VIEWER })
            const conversationId = (await ctx.post(CONVERSATIONS_URL, { title: 'Cancelable' })).json().id

            const ok = await ctx.post(`${CONVERSATIONS_URL}/${conversationId}/cancel`, {})
            expect(ok.statusCode).toBe(StatusCodes.NO_CONTENT)

            const forbidden = await memberCtx.post(`${CONVERSATIONS_URL}/${conversationId}/cancel`, {})
            expect(forbidden.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('Approval gate', () => {
        it('reports applied:false for an unknown gate and enforces ownership', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const memberCtx = await createMemberContext(app, ctx, { projectRole: DefaultProjectRole.VIEWER })
            const conversationId = (await ctx.post(CONVERSATIONS_URL, { title: 'Gated' })).json().id

            const unknownGate = await ctx.post(`${CONVERSATIONS_URL}/${conversationId}/gates`, {
                gateId: 'does-not-exist',
                approved: true,
            })
            expect(unknownGate.statusCode).toBe(StatusCodes.OK)
            expect(unknownGate.json().applied).toBe(false)

            const forbidden = await memberCtx.post(`${CONVERSATIONS_URL}/${conversationId}/gates`, {
                gateId: 'g1',
                approved: true,
            })
            expect(forbidden.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })
})
