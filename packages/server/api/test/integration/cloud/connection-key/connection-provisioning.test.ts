import {
    AppConnectionType,
    AppCredentialType,
    PackageType,
    BlockType,
} from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import jwt from 'jsonwebtoken'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { db } from '../../../helpers/db'
import { createMockBlockMetadata } from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

const APP_NAME = '@intelblocks/block-provision-test'

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

// Register a workspace signing key and return the one-time private key for token signing.
async function mintConnectionKey(token: string, projectId: string): Promise<string> {
    const response = await app!.inject({
        method: 'POST',
        url: '/api/v1/connection-keys',
        headers: { authorization: `Bearer ${token}` },
        body: { projectId, settings: { type: 'SIGNING_KEY' } },
    })
    expect(response.statusCode).toBe(StatusCodes.OK)
    return response.json().settings.privateKey
}

describe('Token-based connection provisioning', () => {
    it('provisions an API-key connection from a valid signed token', async () => {
        const ctx = await createTestContext(app!)

        // A piece must exist for the integration name (connection upsert resolves piece metadata).
        const piece = createMockBlockMetadata({
            name: APP_NAME,
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
            blockType: BlockType.CUSTOM,
        })
        await db.save('block_metadata', piece)

        const privateKey = await mintConnectionKey(ctx.token, ctx.project.id)

        const credential = (await ctx.post('/v1/app-credentials', {
            appName: APP_NAME,
            projectId: ctx.project.id,
            settings: { type: AppCredentialType.API_KEY },
        }))!.json()

        const connectionName = 'my-api-connection'
        const token = jwt.sign({ sub: connectionName }, privateKey, { algorithm: 'RS256' })

        const response = await app!.inject({
            method: 'POST',
            url: '/api/v1/app-connections-from-token',
            body: {
                appCredentialId: credential.id,
                apiKey: 'the-end-user-api-key',
                token,
            },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const connection = response.json()
        expect(connection.type).toBe(AppConnectionType.SECRET_TEXT)
        expect(connection.blockName).toBe(APP_NAME)
        expect(connection.externalId).toBe(`${APP_NAME}_${connectionName}`)
        // The value is never returned.
        expect(connection.value).toBeUndefined()

        // The connection can be read back and deleted via the token.
        const getResponse = await app!.inject({
            method: 'GET',
            url: `/api/v1/app-connections-from-token?projectId=${ctx.project.id}&appName=${encodeURIComponent(APP_NAME)}&token=${token}`,
        })
        expect(getResponse.statusCode).toBe(StatusCodes.OK)
        expect(getResponse.json().externalId).toBe(`${APP_NAME}_${connectionName}`)

        const deleteResponse = await app!.inject({
            method: 'DELETE',
            url: `/api/v1/app-connections-from-token?projectId=${ctx.project.id}&appName=${encodeURIComponent(APP_NAME)}&token=${token}`,
        })
        expect(deleteResponse.statusCode).toBe(StatusCodes.OK)

        const afterDelete = await app!.inject({
            method: 'GET',
            url: `/api/v1/app-connections-from-token?projectId=${ctx.project.id}&appName=${encodeURIComponent(APP_NAME)}&token=${token}`,
        })
        // Gone: an empty body (null) rather than the connection.
        expect(afterDelete.statusCode).toBe(StatusCodes.OK)
        expect(afterDelete.body === '' || afterDelete.json() === null).toBe(true)
    })

    it('rejects provisioning against an unknown app-credential', async () => {
        const ctx = await createTestContext(app!)
        const privateKey = await mintConnectionKey(ctx.token, ctx.project.id)
        const token = jwt.sign({ sub: 'x' }, privateKey, { algorithm: 'RS256' })

        const response = await app!.inject({
            method: 'POST',
            url: '/api/v1/app-connections-from-token',
            body: { appCredentialId: 'ac-does-not-exist', apiKey: 'k', token },
        })

        expect(response.statusCode).not.toBe(StatusCodes.OK)
    })

    afterAll(async () => {
        await databaseConnection().getRepository('block_metadata').createQueryBuilder().delete().execute()
    })
})
