import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'
import {
    ibId,
    BlockType,
    PrincipalType,
    PackageType,
} from '@intelblocks/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { blockCache } from '../../../../src/app/pieces/metadata/piece-cache'
import { blockMetadataService } from '../../../../src/app/pieces/metadata/piece-metadata-service'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockBlockMetadata,
} from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'

let app: FastifyInstance | null = null
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app!.log!
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    await databaseConnection().getRepository('block_metadata').createQueryBuilder().delete().execute()
})

describe('Block Metadata CE API', () => {
    describe('GET /v1/pieces/categories', () => {
        it('should return piece categories', async () => {
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/pieces/categories',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Array.isArray(body)).toBe(true)
        })
    })

    describe('GET /v1/pieces (List)', () => {
        it('should list pieces', async () => {
            const mockPiece = createMockBlockMetadata({
                name: 'ce-list-test-piece',
                blockType: BlockType.OFFICIAL,
                displayName: 'CE List Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('block_metadata', mockPiece)
            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/pieces',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body).toHaveLength(1)
            expect(body[0].name).toBe('ce-list-test-piece')
        })

        it('should filter pieces by searchQuery', async () => {
            const mockPieceA = createMockBlockMetadata({
                name: 'searchable-unique-piece',
                blockType: BlockType.OFFICIAL,
                displayName: 'Searchable Unique Block',
                packageType: PackageType.REGISTRY,
            })
            const mockPieceB = createMockBlockMetadata({
                name: 'other-piece-xyz',
                blockType: BlockType.OFFICIAL,
                displayName: 'Other Block XYZ',
                packageType: PackageType.REGISTRY,
            })
            await db.save('block_metadata', [mockPieceA, mockPieceB])
            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/pieces?searchQuery=Searchable+Unique',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body).toHaveLength(1)
            expect(body[0].name).toBe('searchable-unique-piece')
        })
    })

    describe('GET /v1/pieces/:name', () => {
        it('should get piece by name', async () => {
            const mockPiece = createMockBlockMetadata({
                name: 'ce-get-test-piece',
                blockType: BlockType.OFFICIAL,
                displayName: 'CE Get Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('block_metadata', mockPiece)
            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/pieces/ce-get-test-piece',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.name).toBe('ce-get-test-piece')
            expect(body.displayName).toBe('CE Get Test')
        })

        it('should return 404 for non-existent piece', async () => {
            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/pieces/non-existent-piece-xyz',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('GET /v1/pieces/:scope/:name', () => {
        it('should get piece by scope and name', async () => {
            const ctx = await createTestContext(app!)

            const mockPiece = createMockBlockMetadata({
                name: '@activepieces/ce-scoped-piece',
                blockType: BlockType.OFFICIAL,
                displayName: 'CE Scoped Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('block_metadata', mockPiece)
            await blockCache(mockLog).setup()

            const response = await ctx.get(`/v1/pieces/@activepieces/ce-scoped-piece?projectId=${ctx.project.id}`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.name).toBe('@activepieces/ce-scoped-piece')
        })
    })

    describe('POST /v1/pieces/sync', () => {
        it('should sync pieces as platform admin', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/pieces/sync', {})

            // Sync should succeed (200) or be accepted
            expect([StatusCodes.OK, StatusCodes.NO_CONTENT]).toContain(response?.statusCode)
        })
    })

    describe('release-compatibility fallback', () => {
        it('GET /v1/pieces/:scope/:name falls back to the newest compatible version when latest requires a newer release', async () => {
            const compatible = createMockBlockMetadata({
                name: '@intelblocks/block-release-test',
                blockType: BlockType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.32',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            const incompatible = createMockBlockMetadata({
                name: '@intelblocks/block-release-test',
                blockType: BlockType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('block_metadata', [compatible, incompatible])
            await blockCache(mockLog).setup()

            const ctx = await createTestContext(app!)
            const response = await ctx.get('/v1/pieces/@intelblocks/block-release-test')

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(response?.json().version).toBe('0.1.32')
        })

        it('GET /v1/pieces returns the newest compatible version in list when latest is incompatible', async () => {
            const compatible = createMockBlockMetadata({
                name: 'list-release-test-piece',
                blockType: BlockType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.32',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            const incompatible = createMockBlockMetadata({
                name: 'list-release-test-piece',
                blockType: BlockType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('block_metadata', [compatible, incompatible])
            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/pieces',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const entry = response?.json().find((p: { name: string }) => p.name === 'list-release-test-piece')
            expect(entry).toBeDefined()
            expect(entry.version).toBe('0.1.32')
        })

        it('GET /v1/pieces/:scope/:name returns 404 when all versions are incompatible', async () => {
            const incompatible = createMockBlockMetadata({
                name: '@intelblocks/block-all-incompatible',
                blockType: BlockType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('block_metadata', incompatible)
            await blockCache(mockLog).setup()

            const ctx = await createTestContext(app!)
            const response = await ctx.get('/v1/pieces/@intelblocks/block-all-incompatible')

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('blockMetadataService.get() — custom pieces', () => {
        it('should return undefined for custom piece when platformId is not provided', async () => {
            const platformId = ibId()
            const mockPiece = createMockBlockMetadata({
                name: '@custom/my-piece',
                blockType: BlockType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId,
                version: '0.1.0',
            })
            await db.save('block_metadata', mockPiece)
            await blockCache(mockLog).setup()

            const result = await blockMetadataService(mockLog).get({
                name: '@custom/my-piece',
                version: '0.1.0',
            })
            expect(result).toBeUndefined()
        })

        it('should return custom piece when platformId is provided', async () => {
            const platformId = ibId()
            const mockPiece = createMockBlockMetadata({
                name: '@custom/my-piece',
                blockType: BlockType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId,
                version: '0.1.0',
            })
            await db.save('block_metadata', mockPiece)
            await blockCache(mockLog).setup()

            const result = await blockMetadataService(mockLog).get({
                name: '@custom/my-piece',
                version: '0.1.0',
                platformId,
            })
            expect(result).toBeDefined()
            expect(result?.name).toBe('@custom/my-piece')
        })
    })
})
