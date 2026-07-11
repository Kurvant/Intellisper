import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'
import {
    ibId,
    AppConnectionStatus,
    AppConnectionType,
    PackageType,
    BlockType,
    PLACEHOLDER_CONNECTION_TYPE,
} from '@intelblocks/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { blockMetadataService } from '../../../../src/app/pieces/metadata/piece-metadata-service'
import { db } from '../../../helpers/db'
import {
    createMockBlockMetadata,
} from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { describeWithAuth } from '../../../helpers/describe-with-auth'

let app: FastifyInstance | null = null
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app!.log!
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('AppConnection CE API', () => {
    describeWithAuth('POST /v1/app-connections (Create)', () => app!, (setup) => {
        it('should create a SECRET_TEXT connection', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            const response = await ctx.post('/v1/app-connections', {
                externalId: 'test-secret-connection',
                displayName: 'Test Secret Connection',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'my-secret',
                },
                blockVersion: mockPiece.version,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const body = response?.json()
            expect(body.displayName).toBe('Test Secret Connection')
            expect(body.blockName).toBe(mockPiece.name)
            expect(body.externalId).toBe('test-secret-connection')
            expect(body.value).toBeUndefined()
        })

        it('should create a NO_AUTH connection', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            const response = await ctx.post('/v1/app-connections', {
                externalId: 'test-no-auth-connection',
                displayName: 'Test No Auth',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: AppConnectionType.NO_AUTH,
                value: {
                    type: AppConnectionType.NO_AUTH,
                },
                blockVersion: mockPiece.version,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const body = response?.json()
            expect(body.displayName).toBe('Test No Auth')
        })

        it('should create a placeholder connection with status MISSING', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            const response = await ctx.post('/v1/app-connections', {
                externalId: 'test-placeholder-connection',
                displayName: 'Placeholder Slack',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: PLACEHOLDER_CONNECTION_TYPE,
                blockVersion: mockPiece.version,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const body = response?.json()
            expect(body.displayName).toBe('Placeholder Slack')
            expect(body.type).toBe(AppConnectionType.NO_AUTH)
            expect(body.status).toBe(AppConnectionStatus.MISSING)
            expect(body.blockName).toBe(mockPiece.name)
            expect(body.externalId).toBe('test-placeholder-connection')
        })

        it('should not overwrite an active connection with a placeholder', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            const active = await ctx.post('/v1/app-connections', {
                externalId: 'placeholder-no-clobber',
                displayName: 'Active Secret',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'real-secret',
                },
                blockVersion: mockPiece.version,
            })
            expect(active?.statusCode).toBe(StatusCodes.CREATED)
            const activeBody = active?.json()
            expect(activeBody.status).toBe(AppConnectionStatus.ACTIVE)
            expect(activeBody.type).toBe(AppConnectionType.SECRET_TEXT)

            const placeholder = await ctx.post('/v1/app-connections', {
                externalId: 'placeholder-no-clobber',
                displayName: 'Should Not Win',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: PLACEHOLDER_CONNECTION_TYPE,
                blockVersion: mockPiece.version,
            })
            expect(placeholder?.statusCode).toBe(StatusCodes.CREATED)
            const placeholderBody = placeholder?.json()
            expect(placeholderBody.id).toBe(activeBody.id)
            expect(placeholderBody.status).toBe(AppConnectionStatus.ACTIVE)
            expect(placeholderBody.type).toBe(AppConnectionType.SECRET_TEXT)
            expect(placeholderBody.displayName).toBe('Active Secret')
        })

        it('should transition a placeholder to ACTIVE on real upsert', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            const placeholder = await ctx.post('/v1/app-connections', {
                externalId: 'placeholder-fill-in',
                displayName: 'Pending',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: PLACEHOLDER_CONNECTION_TYPE,
                blockVersion: mockPiece.version,
            })
            expect(placeholder?.statusCode).toBe(StatusCodes.CREATED)
            const placeholderId = placeholder?.json().id

            const filled = await ctx.post('/v1/app-connections', {
                externalId: 'placeholder-fill-in',
                displayName: 'Filled In',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'real-secret',
                },
                blockVersion: mockPiece.version,
            })
            expect(filled?.statusCode).toBe(StatusCodes.CREATED)
            const filledBody = filled?.json()
            expect(filledBody.id).toBe(placeholderId)
            expect(filledBody.type).toBe(AppConnectionType.SECRET_TEXT)
            expect(filledBody.status).toBe(AppConnectionStatus.ACTIVE)
            expect(filledBody.displayName).toBe('Filled In')
        })

        it('should upsert on duplicate externalId', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            const createPayload = {
                externalId: 'upsert-test-connection',
                displayName: 'First Name',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'secret1',
                },
                blockVersion: mockPiece.version,
            }

            const first = await ctx.post('/v1/app-connections', createPayload)
            expect(first?.statusCode).toBe(StatusCodes.CREATED)
            const firstId = first?.json().id

            const second = await ctx.post('/v1/app-connections', {
                ...createPayload,
                displayName: 'Second Name',
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'secret2',
                },
            })
            expect(second?.statusCode).toBe(StatusCodes.CREATED)
            const secondBody = second?.json()
            expect(secondBody.id).toBe(firstId)
            expect(secondBody.displayName).toBe('Second Name')
        })
    })

    describeWithAuth('POST /v1/app-connections/:id (Update)', () => app!, (setup) => {
        it('should update display name', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            const createResponse = await ctx.post('/v1/app-connections', {
                externalId: 'update-test-connection',
                displayName: 'Original Name',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'my-secret',
                },
                blockVersion: mockPiece.version,
            })
            const connectionId = createResponse?.json().id

            const updateResponse = await ctx.post(`/v1/app-connections/${connectionId}`, {
                displayName: 'Updated Name',
            })

            expect(updateResponse?.statusCode).toBe(StatusCodes.OK)
            expect(updateResponse?.json().displayName).toBe('Updated Name')
        })

        it('should return 404 for non-existent connection', async () => {
            const ctx = await setup()
            const nonExistentId = ibId()

            const response = await ctx.post(`/v1/app-connections/${nonExistentId}`, {
                displayName: 'Updated Name',
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describeWithAuth('GET /v1/app-connections (List)', () => app!, (setup) => {
        it('should list connections', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            await ctx.post('/v1/app-connections', {
                externalId: 'list-test-connection',
                displayName: 'Test Connection',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'my-secret',
                },
                blockVersion: mockPiece.version,
            })

            const response = await ctx.get('/v1/app-connections', {
                projectId: ctx.project.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data.length).toBeGreaterThanOrEqual(1)
        })

        it('should filter by blockName', async () => {
            const ctx = await setup()

            const mockPieceA = createMockBlockMetadata({
                name: 'piece-a-filter',
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            const mockPieceB = createMockBlockMetadata({
                name: 'piece-b-filter',
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', [mockPieceA, mockPieceB])
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceA)

            await ctx.post('/v1/app-connections', {
                externalId: 'filter-a',
                displayName: 'Connection A',
                blockName: mockPieceA.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: { type: AppConnectionType.SECRET_TEXT, secret_text: 's' },
                blockVersion: mockPieceA.version,
            })

            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceB)

            await ctx.post('/v1/app-connections', {
                externalId: 'filter-b',
                displayName: 'Connection B',
                blockName: mockPieceB.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: { type: AppConnectionType.SECRET_TEXT, secret_text: 's' },
                blockVersion: mockPieceB.version,
            })

            const response = await ctx.get('/v1/app-connections', {
                projectId: ctx.project.id,
                blockName: mockPieceA.name,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data).toHaveLength(1)
            expect(body.data[0].blockName).toBe(mockPieceA.name)
        })
    })

    describe('GET /v1/app-connections (Isolation)', () => {
        it('should isolate connections between projects', async () => {
            const ctx1 = await createTestContext(app!)
            const ctx2 = await createTestContext(app!)

            const mockPiece = createMockBlockMetadata({
                platformId: ctx1.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            await ctx1.post('/v1/app-connections', {
                externalId: 'isolation-test',
                displayName: 'Project 1 Connection',
                blockName: mockPiece.name,
                projectId: ctx1.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: { type: AppConnectionType.SECRET_TEXT, secret_text: 's' },
                blockVersion: mockPiece.version,
            })

            const response = await ctx2.get('/v1/app-connections', {
                projectId: ctx2.project.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            const ids = body.data.map((c: Record<string, string>) => c.externalId)
            expect(ids).not.toContain('isolation-test')
        })
    })

    describeWithAuth('DELETE /v1/app-connections/:id', () => app!, (setup) => {
        it('should delete a connection', async () => {
            const ctx = await setup()

            const mockPiece = createMockBlockMetadata({
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPiece)
            blockMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPiece)

            const createResponse = await ctx.post('/v1/app-connections', {
                externalId: 'delete-test',
                displayName: 'Delete Me',
                blockName: mockPiece.name,
                projectId: ctx.project.id,
                type: AppConnectionType.SECRET_TEXT,
                value: { type: AppConnectionType.SECRET_TEXT, secret_text: 's' },
                blockVersion: mockPiece.version,
            })
            const connectionId = createResponse?.json().id

            const response = await ctx.delete(`/v1/app-connections/${connectionId}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
        })

        it('should return 404 for non-existent connection', async () => {
            const ctx = await setup()
            const nonExistentId = ibId()

            const response = await ctx.delete(`/v1/app-connections/${nonExistentId}`)

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })
})
