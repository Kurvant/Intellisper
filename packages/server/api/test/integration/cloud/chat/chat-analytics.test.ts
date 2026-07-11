import { ibId, ChatConversationStatus, DefaultProjectRole } from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chatMetricsRecorder } from '../../../../src/app/enterprise/chat/telemetry/chat-metrics-recorder'
import { db } from '../../../helpers/db'
import { createMemberContext, createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

const BASE = '/v1/admin/chat-analytics'

async function seedMetric(overrides: Record<string, unknown>): Promise<void> {
    await db.save('chat_message_metric', {
        id: ibId(),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        projectId: null,
        provider: 'ANTHROPIC',
        model: 'anthropic/claude-sonnet-4.6',
        toolsUsed: 0,
        messageChars: 10,
        licenseKey: null,
        ...overrides,
    })
}

describe('Chat analytics admin API (H.2.m)', () => {
    describe('Auth (dual-gate)', () => {
        it('rejects an anonymous request with no operator key and no JWT', async () => {
            const response = await app.inject({ method: 'GET', url: `/api${BASE}/usage` })
            expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        })

        it('rejects a non-admin (member) tenant principal', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const memberCtx = await createMemberContext(app, ctx, { projectRole: DefaultProjectRole.VIEWER })
            const response = await memberCtx.get(`${BASE}/usage`)
            expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        })

        it('allows a platform-admin JWT (the owner)', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const response = await ctx.get(`${BASE}/usage`)
            expect(response.statusCode).toBe(StatusCodes.OK)
        })

        it('allows the operator api-key header', async () => {
            const operatorKey = process.env.IB_API_KEY
            const response = await app.inject({
                method: 'GET',
                url: `/api${BASE}/usage`,
                headers: { 'api-key': operatorKey },
            })
            expect(response.statusCode).toBe(StatusCodes.OK)
        })
    })

    describe('Usage aggregation', () => {
        it('aggregates totals and a grouped series over seeded metrics', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const platformId = ctx.platform.id
            const userId = ctx.user.id
            const conversationId = ibId()

            await seedMetric({ platformId, userId, conversationId, toolsUsed: 2 })
            await seedMetric({ platformId, userId, conversationId, toolsUsed: 3 })
            await seedMetric({ platformId, userId, conversationId: ibId(), toolsUsed: 0, provider: 'OPENAI', model: 'gpt-4o' })

            const response = await ctx.get(`${BASE}/usage`, { groupBy: 'provider' })
            expect(response.statusCode).toBe(StatusCodes.OK)
            const body = response.json()
            // 3 messages, 5 tool calls, 1 distinct user, 2 distinct conversations (scoped to range).
            expect(body.totalMessages).toBeGreaterThanOrEqual(3)
            expect(body.totalToolCalls).toBeGreaterThanOrEqual(5)
            expect(body.distinctUsers).toBeGreaterThanOrEqual(1)
            const providers = body.series.map((s: { key: string }) => s.key)
            expect(providers).toEqual(expect.arrayContaining(['ANTHROPIC', 'OPENAI']))
        })
    })

    describe('By-org rollup', () => {
        it('returns per-organization rows with platform name and counts', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const platformId = ctx.platform.id
            await seedMetric({ platformId, userId: ctx.user.id, conversationId: ibId(), toolsUsed: 1 })

            const response = await ctx.get(`${BASE}/by-org`)
            expect(response.statusCode).toBe(StatusCodes.OK)
            const body = response.json()
            expect(Array.isArray(body.data)).toBe(true)
            const row = body.data.find((r: { platformId: string }) => r.platformId === platformId)
            expect(row).toBeDefined()
            expect(row.messages).toBeGreaterThanOrEqual(1)
            expect(row.platformName).toBe(ctx.platform.name)
        })
    })

    describe('Conversations (ops view — no message bodies)', () => {
        it('lists conversation metadata without message text and drills into detail', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const created = await ctx.post('/v1/chat/conversations', { title: 'Ops View' })
            const conversationId = created.json().id

            const listResponse = await ctx.get(`${BASE}/conversations`, { platformId: ctx.platform.id })
            expect(listResponse.statusCode).toBe(StatusCodes.OK)
            const listBody = listResponse.json()
            const item = listBody.data.find((c: { id: string }) => c.id === conversationId)
            expect(item).toBeDefined()
            expect(item.title).toBe('Ops View')
            // No message bodies leak into the list.
            expect(item.messages).toBeUndefined()
            expect(typeof item.messageCount).toBe('number')

            const detailResponse = await ctx.get(`${BASE}/conversations/${conversationId}`)
            expect(detailResponse.statusCode).toBe(StatusCodes.OK)
            expect(Array.isArray(detailResponse.json().messages)).toBe(true)
        })

        it('returns 404 for a non-existent conversation detail', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            // A well-formed but unknown id passes schema validation and hits the not-found path.
            const response = await ctx.get(`${BASE}/conversations/${ibId()}`)
            expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('Recorder failure isolation (DoD)', () => {
        it('never throws even when the metric insert fails (e.g. dangling FK)', async () => {
            // A conversation referencing a platform/user that do not exist forces the metric insert
            // to fail on a foreign-key violation; the recorder must swallow it and resolve.
            const conversation = {
                id: ibId(),
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                platformId: ibId(),
                projectId: null,
                userId: ibId(),
                title: null,
                modelName: 'smart',
                status: ChatConversationStatus.IDLE,
                messages: [],
                uiMessages: null,
                summary: null,
                summarizedUpToIndex: null,
            }
            await expect(
                chatMetricsRecorder(app.log).recordMessageMetric({ conversation, turnToolCount: 1 }),
            ).resolves.toBeUndefined()
        })
    })

    describe('Rollout funnel', () => {
        it('returns the funnel snapshot shape', async () => {
            const ctx = await createTestContext(app, { plan: { chatEnabled: true } })
            const response = await ctx.get(`${BASE}/rollout-funnel`)
            expect(response.statusCode).toBe(StatusCodes.OK)
            const body = response.json()
            expect(typeof body.landed).toBe('number')
            expect(typeof body.chatted).toBe('number')
            expect(typeof body.cap).toBe('number')
            expect(typeof body.closed).toBe('boolean')
        })
    })
})
