import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Browser Agent module (Phase 0 skeleton)', () => {
    it('registers under the cloud edition and resolves GET /v1/browser-agent/ping', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.get('/v1/browser-agent/ping')

        expect(response?.statusCode).toBe(StatusCodes.OK)
        const body = response?.json()
        expect(body.status).toBe('ok')
        // Protocol version is the extension↔server contract handshake (additive-only from v1).
        expect(typeof body.protocolVersion).toBe('number')
        expect(body.protocolVersion).toBeGreaterThanOrEqual(1)
    })
})
