import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'
import {
    PackageType,
    BlockType,
} from '@intelblocks/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { blockMetadataService } from '../../../../src/app/pieces/metadata/piece-metadata-service'
import { db } from '../../../helpers/db'


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

describe('Block Metadata Create', () => {
    it('should insert a piece via create', async () => {
        const service = blockMetadataService(mockLog)

        await service.create({
            blockMetadata: {
                name: 'piece-a',
                displayName: 'Block A',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
            },
            packageType: PackageType.REGISTRY,
            blockType: BlockType.OFFICIAL,
            publishCacheRefresh: false,
        })

        const repo = databaseConnection().getRepository('block_metadata')
        const allPieces = await repo.find()
        expect(allPieces).toHaveLength(1)
        expect(allPieces[0].name).toBe('piece-a')
    })

    it('should reject duplicate piece creation', async () => {
        const service = blockMetadataService(mockLog)

        await service.create({
            blockMetadata: {
                name: 'piece-dup',
                displayName: 'Block Dup',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
            },
            packageType: PackageType.REGISTRY,
            blockType: BlockType.OFFICIAL,
            publishCacheRefresh: false,
        })

        await expect(service.create({
            blockMetadata: {
                name: 'piece-dup',
                displayName: 'Block Dup',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
            },
            packageType: PackageType.REGISTRY,
            blockType: BlockType.OFFICIAL,
            publishCacheRefresh: false,
        })).rejects.toThrow()
    })

    it('should bulk delete pieces', async () => {
        const service = blockMetadataService(mockLog)

        await service.create({
            blockMetadata: {
                name: 'delete-me',
                displayName: 'Delete Me',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
            },
            packageType: PackageType.REGISTRY,
            blockType: BlockType.OFFICIAL,
            publishCacheRefresh: false,
        })

        await service.create({
            blockMetadata: {
                name: 'keep-me',
                displayName: 'Keep Me',
                version: '1.0.0',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '9.9.9',
                actions: {},
                triggers: {},
                authors: [],
                logoUrl: 'https://example.com/logo.png',
            },
            packageType: PackageType.REGISTRY,
            blockType: BlockType.OFFICIAL,
            publishCacheRefresh: false,
        })

        await service.bulkDelete([{ name: 'delete-me', version: '1.0.0' }])

        const repo = databaseConnection().getRepository('block_metadata')
        const allPieces = await repo.find()
        expect(allPieces).toHaveLength(1)
        expect(allPieces[0].name).toBe('keep-me')
    })
})
