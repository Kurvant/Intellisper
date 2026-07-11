import {
    ibId,
    ApplicationEventName,
    PlatformRole,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { generateMockToken } from '../../../helpers/auth'
import { mockBasicUser } from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

// The event-destination store is exposed to organizations through the canonical, house-style
// `/v1/platform-webhooks` surface (see platform-webhooks.module.ts + its EE suite). This suite was
// originally written against a legacy `/v1/event-destinations` + PATCH contract that the clean-room
// deliberately superseded; it has been adapted to the canonical surface (POST for update, 201 on
// create, 204 on delete, entitlement-gated on the event-streaming plan flag) while keeping the
// behaviours it uniquely covers (idempotent delete, /test with a default event, cross-platform
// isolation).

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

const WEBHOOKS_URL = '/v1/platform-webhooks'
const withStreaming = () => createTestContext(app!, { plan: { eventStreamingEnabled: true } })

describe('Event Destinations API (via /v1/platform-webhooks)', () => {
    describe('POST /v1/platform-webhooks (Create)', () => {
        it('should create an event destination', async () => {
            const ctx = await withStreaming()

            const response = await ctx.post(WEBHOOKS_URL, {
                url: 'https://example.com/webhook',
                events: [ApplicationEventName.FLOW_CREATED],
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const body = response?.json()
            expect(body.url).toBe('https://example.com/webhook')
            expect(body.events).toContain(ApplicationEventName.FLOW_CREATED)
            expect(body.platformId).toBe(ctx.platform.id)
            expect(body.id).toBeDefined()
        })
    })

    describe('GET /v1/platform-webhooks (List)', () => {
        it('should list event destinations', async () => {
            const ctx = await withStreaming()

            await ctx.post(WEBHOOKS_URL, {
                url: 'https://example.com/webhook1',
                events: [ApplicationEventName.FLOW_CREATED],
            })

            const response = await ctx.get(WEBHOOKS_URL)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data.length).toBeGreaterThanOrEqual(1)
        })

        it('should return empty list for new platform', async () => {
            const ctx = await withStreaming()

            const response = await ctx.get(WEBHOOKS_URL)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data).toBeDefined()
            expect(Array.isArray(body.data)).toBe(true)
        })
    })

    describe('POST /v1/platform-webhooks/:id (Update)', () => {
        it('should update event destination', async () => {
            const ctx = await withStreaming()

            const createResponse = await ctx.post(WEBHOOKS_URL, {
                url: 'https://example.com/original',
                events: [ApplicationEventName.FLOW_CREATED],
            })
            const destId = createResponse?.json().id

            const response = await ctx.post(`${WEBHOOKS_URL}/${destId}`, {
                url: 'https://example.com/updated',
                events: [ApplicationEventName.FLOW_DELETED, ApplicationEventName.FLOW_CREATED],
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.url).toBe('https://example.com/updated')
            expect(body.events).toContain(ApplicationEventName.FLOW_DELETED)
        })

        it('should return 404 for a non-existent destination', async () => {
            const ctx = await withStreaming()
            const nonExistentId = ibId()

            const response = await ctx.post(`${WEBHOOKS_URL}/${nonExistentId}`, {
                url: 'https://example.com/updated',
                events: [ApplicationEventName.FLOW_CREATED],
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('DELETE /v1/platform-webhooks/:id', () => {
        it('should delete an event destination', async () => {
            const ctx = await withStreaming()

            const createResponse = await ctx.post(WEBHOOKS_URL, {
                url: 'https://example.com/delete-me',
                events: [ApplicationEventName.FLOW_CREATED],
            })
            const destId = createResponse?.json().id

            const response = await ctx.delete(`${WEBHOOKS_URL}/${destId}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        })

        it('should return 204 for a non-existent destination (idempotent delete)', async () => {
            const ctx = await withStreaming()
            const nonExistentId = ibId()

            const response = await ctx.delete(`${WEBHOOKS_URL}/${nonExistentId}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        })
    })

    describe('POST /v1/platform-webhooks/test', () => {
        it('should accept a test request with a webhook URL and an event name', async () => {
            const ctx = await withStreaming()

            const response = await ctx.post(`${WEBHOOKS_URL}/test`, {
                url: 'https://example.com/webhook',
                event: ApplicationEventName.FLOW_CREATED,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
        })

        it('should accept a test request with no event (defaults to flow.created)', async () => {
            const ctx = await withStreaming()

            const response = await ctx.post(`${WEBHOOKS_URL}/test`, {
                url: 'https://example.com/webhook',
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
        })
    })

    describe('Auth', () => {
        it('should return 403 for non-admin user', async () => {
            const ctx = await withStreaming()

            const { mockUser } = await mockBasicUser({
                user: {
                    platformId: ctx.platform.id,
                    platformRole: PlatformRole.MEMBER,
                },
            })

            const memberToken = await generateMockToken({
                id: mockUser.id,
                type: PrincipalType.USER,
                platform: { id: ctx.platform.id },
            })

            const response = await app?.inject({
                method: 'POST',
                url: `/api${WEBHOOKS_URL}`,
                headers: { authorization: `Bearer ${memberToken}` },
                body: {
                    url: 'https://example.com/unauthorized',
                    events: [ApplicationEventName.FLOW_CREATED],
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })

        it('should isolate event destinations between platforms', async () => {
            const ctx1 = await withStreaming()
            const ctx2 = await withStreaming()

            await ctx1.post(WEBHOOKS_URL, {
                url: 'https://example.com/platform1',
                events: [ApplicationEventName.FLOW_CREATED],
            })

            const response = await ctx2.get(WEBHOOKS_URL)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            const urls = body.data.map((d: Record<string, string>) => d.url)
            expect(urls).not.toContain('https://example.com/platform1')
        })
    })
})
