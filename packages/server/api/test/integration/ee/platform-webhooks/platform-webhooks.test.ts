import {
    ApplicationEventName,
    EventDestinationScope,
    PlatformRole,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { generateMockToken } from '../../../helpers/auth'
import { createMockEventDestination, mockAndSaveBasicSetup, mockBasicUser } from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

const withStreaming = () => createTestContext(app!, { plan: { eventStreamingEnabled: true } })

describe('Platform Webhooks API', () => {
    describe('POST /v1/platform-webhooks (create)', () => {
        it('registers a webhook destination', async () => {
            const ctx = await withStreaming()

            const response = await ctx.post('/v1/platform-webhooks', {
                url: 'https://hooks.example.com/incoming',
                events: [ApplicationEventName.FLOW_CREATED, ApplicationEventName.FLOW_DELETED],
            })

            expect(response.statusCode).toBe(StatusCodes.CREATED)
            const body = response.json()
            expect(body.id).toBeDefined()
            expect(body.platformId).toBe(ctx.platform.id)
            expect(body.scope).toBe(EventDestinationScope.PLATFORM)
            expect(body.url).toBe('https://hooks.example.com/incoming')
            expect(body.events).toEqual([ApplicationEventName.FLOW_CREATED, ApplicationEventName.FLOW_DELETED])
        })

        it('rejects an invalid url (400)', async () => {
            const ctx = await withStreaming()

            const response = await ctx.post('/v1/platform-webhooks', {
                url: 'not-a-url',
                events: [ApplicationEventName.FLOW_CREATED],
            })

            expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        })

        it('402/403 when event streaming is not enabled', async () => {
            const ctx = await createTestContext(app!, { plan: { eventStreamingEnabled: false } })

            const response = await ctx.post('/v1/platform-webhooks', {
                url: 'https://hooks.example.com/incoming',
                events: [ApplicationEventName.FLOW_CREATED],
            })

            expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        })

        it('rejects a non-admin member (403)', async () => {
            const { mockPlatform } = await mockAndSaveBasicSetup({ plan: { eventStreamingEnabled: true } })
            const { mockUser } = await mockBasicUser({
                user: { platformId: mockPlatform.id, platformRole: PlatformRole.MEMBER },
            })
            const token = await generateMockToken({
                type: PrincipalType.USER,
                id: mockUser.id,
                platform: { id: mockPlatform.id },
            })

            const response = await app!.inject({
                method: 'POST',
                url: '/api/v1/platform-webhooks',
                headers: { authorization: `Bearer ${token}` },
                body: { url: 'https://hooks.example.com/incoming', events: [ApplicationEventName.FLOW_CREATED] },
            })

            expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describe('GET /v1/platform-webhooks (list)', () => {
        it('lists the organization webhook destinations, scoped to the platform', async () => {
            const ctx = await withStreaming()
            await ctx.post('/v1/platform-webhooks', {
                url: 'https://hooks.example.com/a',
                events: [ApplicationEventName.FLOW_CREATED],
            })

            const response = await ctx.get('/v1/platform-webhooks')

            expect(response.statusCode).toBe(StatusCodes.OK)
            const body = response.json()
            expect(body.data.length).toBeGreaterThanOrEqual(1)
            for (const destination of body.data) {
                expect(destination.platformId).toBe(ctx.platform.id)
            }
        })

        it('does not list another organization webhooks', async () => {
            const ctx = await withStreaming()
            const otherSetup = await mockAndSaveBasicSetup({ plan: { eventStreamingEnabled: true } })
            const foreign = createMockEventDestination({
                platformId: otherSetup.mockPlatform.id,
                events: [ApplicationEventName.FLOW_CREATED],
                scope: EventDestinationScope.PLATFORM,
            })
            await databaseConnection().getRepository('event_destination').save(foreign)

            const response = await ctx.get('/v1/platform-webhooks')

            expect(response.statusCode).toBe(StatusCodes.OK)
            const ids = response.json().data.map((d: { id: string }) => d.id)
            expect(ids).not.toContain(foreign.id)
        })
    })

    describe('POST /v1/platform-webhooks/:id (update)', () => {
        it('updates the url and events', async () => {
            const ctx = await withStreaming()
            const created = (await ctx.post('/v1/platform-webhooks', {
                url: 'https://hooks.example.com/old',
                events: [ApplicationEventName.FLOW_CREATED],
            })).json()

            const response = await ctx.post(`/v1/platform-webhooks/${created.id}`, {
                url: 'https://hooks.example.com/new',
                events: [ApplicationEventName.FLOW_DELETED],
            })

            expect(response.statusCode).toBe(StatusCodes.OK)
            const body = response.json()
            expect(body.url).toBe('https://hooks.example.com/new')
            expect(body.events).toEqual([ApplicationEventName.FLOW_DELETED])
        })
    })

    describe('DELETE /v1/platform-webhooks/:id (delete)', () => {
        it('deletes a webhook destination', async () => {
            const ctx = await withStreaming()
            const created = (await ctx.post('/v1/platform-webhooks', {
                url: 'https://hooks.example.com/gone',
                events: [ApplicationEventName.FLOW_CREATED],
            })).json()

            const response = await ctx.delete(`/v1/platform-webhooks/${created.id}`)
            expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)

            const list = await ctx.get('/v1/platform-webhooks')
            const ids = list.json().data.map((d: { id: string }) => d.id)
            expect(ids).not.toContain(created.id)
        })
    })

    describe('POST /v1/platform-webhooks/test', () => {
        it('accepts a test-delivery request', async () => {
            const ctx = await withStreaming()

            const response = await ctx.post('/v1/platform-webhooks/test', {
                url: 'https://hooks.example.com/test',
                event: ApplicationEventName.FLOW_CREATED,
            })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.json().success).toBe(true)
        })
    })
})
