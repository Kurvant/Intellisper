import { generateKeyPairSync } from 'node:crypto'
import {
    AppCredentialType,
    ConnectionKeyType,
    UpsertSigningKeyConnection,
} from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import jwt from 'jsonwebtoken'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'
import { createTestContext } from '../../../helpers/test-context'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

function upsertBody(projectId: string): UpsertSigningKeyConnection {
    return {
        projectId,
        settings: { type: ConnectionKeyType.SIGNING_KEY },
    }
}

describe('Connection Key API', () => {
    describe('Create connection key (signing key)', () => {
        it('mints a keypair, persists the public key, and returns the private key exactly once', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/connection-keys', upsertBody(ctx.project.id))

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response!.json()
            expect(body.id).toHaveLength(21)
            expect(body.projectId).toBe(ctx.project.id)
            expect(body.settings.type).toBe(ConnectionKeyType.SIGNING_KEY)
            // Public key is returned; private key is returned THIS ONCE.
            expect(body.settings.publicKey).toContain('BEGIN PUBLIC KEY')
            expect(body.settings.privateKey).toContain('BEGIN PRIVATE KEY')

            // The private key is NOT retrievable afterwards (never stored).
            const listResponse = await ctx.get('/v1/connection-keys', { projectId: ctx.project.id })
            expect(listResponse?.statusCode).toBe(StatusCodes.OK)
            const listed = listResponse!.json().data.find((k: { id: string }) => k.id === body.id)
            expect(listed).toBeDefined()
            expect(listed.settings.publicKey).toContain('BEGIN PUBLIC KEY')
            expect(listed.settings.privateKey).toBeUndefined()
        })

        it('rejects creating a key for another project (403)', async () => {
            const ctxOne = await createTestContext(app!)
            const ctxTwo = await createTestContext(app!)

            const response = await app?.inject({
                method: 'POST',
                url: '/api/v1/connection-keys',
                headers: { authorization: `Bearer ${ctxOne.token}` },
                body: upsertBody(ctxTwo.project.id),
            })

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describe('List connection keys', () => {
        it('lists only the callers workspace keys, without private material', async () => {
            const ctx = await createTestContext(app!)
            await ctx.post('/v1/connection-keys', upsertBody(ctx.project.id))
            await ctx.post('/v1/connection-keys', upsertBody(ctx.project.id))

            const response = await ctx.get('/v1/connection-keys', { projectId: ctx.project.id })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response!.json()
            expect(body.data.length).toBeGreaterThanOrEqual(2)
            for (const key of body.data) {
                expect(key.projectId).toBe(ctx.project.id)
                expect(key.settings.privateKey).toBeUndefined()
            }
        })

        it('rejects listing another projects keys (403)', async () => {
            const ctxOne = await createTestContext(app!)
            const ctxTwo = await createTestContext(app!)

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/connection-keys',
                query: { projectId: ctxTwo.project.id },
                headers: { authorization: `Bearer ${ctxOne.token}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describe('Delete connection key', () => {
        it('deletes a key in the callers workspace', async () => {
            const ctx = await createTestContext(app!)
            const created = (await ctx.post('/v1/connection-keys', upsertBody(ctx.project.id)))!.json()

            const response = await ctx.delete(`/v1/connection-keys/${created.id}`)
            expect(response?.statusCode).toBe(StatusCodes.OK)

            const listResponse = await ctx.get('/v1/connection-keys', { projectId: ctx.project.id })
            const stillThere = listResponse!.json().data.find((k: { id: string }) => k.id === created.id)
            expect(stillThere).toBeUndefined()
        })

        it('rejects deleting a key owned by another project (403)', async () => {
            const ctxOne = await createTestContext(app!)
            const ctxTwo = await createTestContext(app!)
            const created = (await ctxTwo.post('/v1/connection-keys', upsertBody(ctxTwo.project.id)))!.json()

            const response = await app?.inject({
                method: 'DELETE',
                url: `/api/v1/connection-keys/${created.id}`,
                headers: { authorization: `Bearer ${ctxOne.token}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describe('Token-based provisioning', () => {
        it('rejects a provisioning token that validates against no workspace key', async () => {
            const ctx = await createTestContext(app!)

            // A credential exists, but the token is signed with a key unrelated to the workspace.
            const credential = (await ctx.post('/v1/app-credentials', {
                appName: '@intelblocks/block-webhook',
                projectId: ctx.project.id,
                settings: { type: AppCredentialType.API_KEY },
            }))!.json()

            const foreignPrivateKey = generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            }).privateKey
            const token = jwt.sign({ sub: 'my-connection' }, foreignPrivateKey, { algorithm: 'RS256' })

            const response = await app?.inject({
                method: 'POST',
                url: '/api/v1/app-connections-from-token',
                body: { appCredentialId: credential.id, apiKey: 'k', token },
            })

            // Verified against no registered key → rejected, not provisioned.
            expect(response?.statusCode).not.toBe(StatusCodes.OK)
        })
    })
})
