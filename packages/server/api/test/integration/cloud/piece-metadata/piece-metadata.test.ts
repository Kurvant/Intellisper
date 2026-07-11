import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'
import {
    ibId,
    FilteredBlockBehavior,
    BlocksFilterType,
    BlockType,
    PlatformRole,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { blockCache } from '../../../../src/app/pieces/metadata/piece-cache'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockBlockMetadata,
    createMockPlan,
    createMockProject,
    mockAndSaveBasicSetup,
    mockBasicUser,
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
describe('Block Metadata API', () => {
    describe('Get Block metadata', () => {
        it('Should return metadata when authenticated', async () => {
            // arrange
            const mockPieceMetadata = createMockBlockMetadata({
                name: '@activepieces/a',
                blockType: BlockType.OFFICIAL,
            })
            await db.save('block_metadata', mockPieceMetadata)

            await blockCache(mockLog).setup()

            const ctx = await createTestContext(app!, {
                platform: {
                    filteredBlockBehavior: FilteredBlockBehavior.BLOCKED,
                    filteredBlockNames: [],
                },
            })

            // act
            const response = await ctx.get(`/v1/blocks/@activepieces/a?projectId=${ctx.project.id}`)

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(responseBody.id).toBe(mockPieceMetadata.id)
        })

        it('Should return metadata when not authenticated', async () => {
            // arrange
            const mockPieceMetadata = createMockBlockMetadata({
                name: '@activepieces/a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
            })
            await db.save('block_metadata', mockPieceMetadata)

            await blockCache(mockLog).setup()
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/blocks/@activepieces/a',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            // Expectations for each attribute
            expect(responseBody.actions).toEqual(mockPieceMetadata.actions)
            expect(responseBody.triggers).toEqual(mockPieceMetadata.triggers)
            expect(responseBody.archiveId).toBe(mockPieceMetadata.archiveId)
            expect(responseBody.auth).toEqual(mockPieceMetadata.auth)
            expect(responseBody.description).toBe(mockPieceMetadata.description)
            expect(responseBody.directoryPath).toBe(mockPieceMetadata.directoryPath)
            expect(responseBody.displayName).toBe(mockPieceMetadata.displayName)
            expect(responseBody.id).toBe(mockPieceMetadata.id)
            expect(responseBody.logoUrl).toBe(mockPieceMetadata.logoUrl)
            expect(responseBody.maximumSupportedRelease).toBe(
                mockPieceMetadata.maximumSupportedRelease,
            )
            expect(responseBody.minimumSupportedRelease).toBe(
                mockPieceMetadata.minimumSupportedRelease,
            )
            expect(responseBody.packageType).toBe(mockPieceMetadata.packageType)
            expect(responseBody.blockType).toBe(mockPieceMetadata.blockType)
            expect(responseBody.platformId).toBe(mockPieceMetadata.platformId)
            expect(responseBody.version).toBe(mockPieceMetadata.version)
        })
    })
    describe('List Block Metadata endpoint', () => {
        it('Should list platform pieces', async () => {
            const { mockOwner, mockPlatform } = await mockAndSaveBasicSetup({
                platform: {
                    filteredBlockBehavior: FilteredBlockBehavior.BLOCKED,
                    filteredBlockNames: [],
                },
            })

            const { mockPlatform: mockPlatform2 } = await mockAndSaveBasicSetup({
                user: {
                    platformId: mockPlatform.id,
                    platformRole: PlatformRole.MEMBER,
                },
            })

            const mockProject = await createProjectAndPlan({
                platformId: mockPlatform.id,
                ownerId: mockOwner.id,
            })


            // arrange
            const mockPieceMetadataA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.CUSTOM,
                platformId: mockPlatform.id,
                displayName: 'a',
            })
            const mockPieceMetadataB = createMockBlockMetadata({
                name: 'b',
                blockType: BlockType.OFFICIAL,
                displayName: 'b',
            })
            const mockPieceMetadataC = createMockBlockMetadata({
                name: 'c',
                blockType: BlockType.CUSTOM,
                platformId: mockPlatform2.id,
                displayName: 'c',
            })
            const mockPieceMetadataD = createMockBlockMetadata({
                name: 'd',
                blockType: BlockType.CUSTOM,
                platformId: mockPlatform.id,
                displayName: 'd',
            })
            await db.save('block_metadata', [
                mockPieceMetadataA,
                mockPieceMetadataB,
                mockPieceMetadataC,
                mockPieceMetadataD,
            ])

            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.USER,
                
                id: mockOwner.id,
                platform: {
                    id: mockPlatform.id,
                },
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/blocks?projectId=${mockProject.id}`,
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })
            // assert
            const responseBody = response?.json()
            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(responseBody).toHaveLength(3)
            expect(responseBody?.[0].id).toBe(mockPieceMetadataA.id)
            expect(responseBody?.[1].id).toBe(mockPieceMetadataB.id)
            expect(responseBody?.[2].id).toBe(mockPieceMetadataD.id)
        })

        it('Should show official piece to other platforms when a custom piece with the same name exists', async () => {
            // arrange
            const { mockOwner: ownerA, mockPlatform: platformA } = await mockAndSaveBasicSetup({
                platform: {
                    filteredBlockBehavior: FilteredBlockBehavior.BLOCKED,
                    filteredBlockNames: [],
                },
            })
            const { mockOwner: ownerB, mockPlatform: platformB } = await mockAndSaveBasicSetup({
                platform: {
                    filteredBlockBehavior: FilteredBlockBehavior.BLOCKED,
                    filteredBlockNames: [],
                },
            })

            const projectA = await createProjectAndPlan({
                platformId: platformA.id,
                ownerId: ownerA.id,
            })
            const projectB = await createProjectAndPlan({
                platformId: platformB.id,
                ownerId: ownerB.id,
            })

            const officialPieceA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
                version: '1.0.0',
            })
            const customPieceA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.CUSTOM,
                platformId: platformA.id,
                displayName: 'a',
                version: '2.0.0',
            })
            await db.save('block_metadata', [officialPieceA, customPieceA])

            await blockCache(mockLog).setup()

            const tokenA = await generateMockToken({
                type: PrincipalType.USER,
                id: ownerA.id,
                platform: {
                    id: platformA.id,
                },
            })
            const tokenB = await generateMockToken({
                type: PrincipalType.USER,
                id: ownerB.id,
                platform: {
                    id: platformB.id,
                },
            })

            const responseA = await app?.inject({
                method: 'GET',
                url: `/api/v1/blocks?projectId=${projectA.id}`,
                headers: {
                    authorization: `Bearer ${tokenA}`,
                },
            })

            const responseB = await app?.inject({
                method: 'GET',
                url: `/api/v1/blocks?projectId=${projectB.id}`,
                headers: {
                    authorization: `Bearer ${tokenB}`,
                },
            })

            const bodyA = responseA?.json()
            expect(responseA?.statusCode).toBe(StatusCodes.OK)
            expect(bodyA).toHaveLength(1)
            expect(bodyA?.[0].name).toBe('a')
            expect(bodyA?.[0].version).toBe('2.0.0')
            expect(bodyA?.[0].blockType).toBe(BlockType.CUSTOM)

            const bodyB = responseB?.json()
            expect(responseB?.statusCode).toBe(StatusCodes.OK)
            expect(bodyB).toHaveLength(1)
            expect(bodyB?.[0].name).toBe('a')
            expect(bodyB?.[0].version).toBe('1.0.0')
            expect(bodyB?.[0].blockType).toBe(BlockType.OFFICIAL)
        })

        it('Should list correct version by piece name', async () => {
            // arrange
            const mockPieceMetadataA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
                version: '0.0.1',
            })
            const mockPieceMetadataB = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
                version: '0.0.2',
            })
            const mockPieceMetadataC = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
                version: '0.1.0',
            })
            const mockPieceMetadataD = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
                version: '0.1.1',
            })
            await db.save('block_metadata', [mockPieceMetadataA, mockPieceMetadataB, mockPieceMetadataC, mockPieceMetadataD])

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })
            await blockCache(mockLog).setup()

            // act
            const exactVersionResponse = await app?.inject({
                method: 'GET',
                url: '/api/v1/blocks/a?version=0.0.1',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })
            const exactVersionResponseBody = exactVersionResponse?.json()
            expect(exactVersionResponse?.statusCode).toBe(StatusCodes.OK)
            expect(exactVersionResponseBody?.id).toBe(mockPieceMetadataA.id)

            const telda2VersionResponse = await app?.inject({
                method: 'GET',
                url: '/api/v1/blocks/a?version=~0.0.2',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })
            const teldaVersion2ResponseBody = telda2VersionResponse?.json()
            expect(telda2VersionResponse?.statusCode).toBe(StatusCodes.OK)
            expect(teldaVersion2ResponseBody?.id).toBe(mockPieceMetadataB.id)

            const teldaVersionResponse = await app?.inject({
                method: 'GET',
                url: '/api/v1/blocks/a?version=~0.0.1',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })
            const teldaVersionResponseBody = teldaVersionResponse?.json()
            expect(teldaVersionResponse?.statusCode).toBe(StatusCodes.OK)
            expect(teldaVersionResponseBody?.id).toBe(mockPieceMetadataB.id)

            const notFoundVersionResponse = await app?.inject({
                method: 'GET',
                url: '/api/v1/blocks/a?version=~0.1.2',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })
            expect(notFoundVersionResponse?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })

        it('Should list latest version by piece name', async () => {
            // arrange
            const mockPieceMetadataA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
                version: '0.31.0',
            })
            const mockPieceMetadataB = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
                version: '1.0.0',
            })
            await db.save('block_metadata', [mockPieceMetadataA, mockPieceMetadataB])

            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/blocks',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(responseBody).toHaveLength(1)
            expect(responseBody?.[0].id).toBe(mockPieceMetadataB.id)
        })


        it('Sorts by piece name', async () => {
            // arrange
            const mockPieceMetadataA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
            })
            const mockPieceMetadataB = createMockBlockMetadata({
                name: 'b',
                blockType: BlockType.OFFICIAL,
                displayName: 'b',
            })
            await db.save('block_metadata', [mockPieceMetadataA, mockPieceMetadataB])

            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: ibId(),
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/blocks',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(responseBody).toHaveLength(2)
            expect(responseBody?.[0].id).toBe(mockPieceMetadataA.id)
            expect(responseBody?.[1].id).toBe(mockPieceMetadataB.id)
        })

        it('Allows filtered pieces if project filter is set to "ALLOWED"', async () => {
            // arrange
            const { mockPlatform } = await mockAndSaveBasicSetup({
                platform: {
                    filteredBlockBehavior: FilteredBlockBehavior.BLOCKED,
                    filteredBlockNames: [],
                },
            })

            const { mockUser } = await mockBasicUser({
                user: {
                    platformId: mockPlatform.id,
                    platformRole: PlatformRole.MEMBER,
                },
            })

            const mockProject = await createProjectAndPlan({
                ownerId: mockUser.id,
                platformId: mockPlatform.id,
                blocksFilterType: BlocksFilterType.ALLOWED,
                blocks: ['a'],
            })

            const mockPieceMetadataA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
            })
            const mockPieceMetadataB = createMockBlockMetadata({
                name: 'b',
                blockType: BlockType.OFFICIAL,
                displayName: 'b',
            })
            await db.save('block_metadata', [mockPieceMetadataA, mockPieceMetadataB])

            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.USER,

                platform: {
                    id: mockPlatform.id,
                },
                id: mockUser.id,
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/blocks?projectId=${mockProject.id}`,
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(responseBody).toHaveLength(1)
            expect(responseBody?.[0].id).toBe(mockPieceMetadataA.id)
        })

        it('Allows filtered pieces if platform filter is set to "ALLOWED"', async () => {
            // arrange
            const { mockPlatform } = await mockAndSaveBasicSetup({
                platform: {
                    filteredBlockNames: ['a'],
                    filteredBlockBehavior: FilteredBlockBehavior.ALLOWED,
                },
            })

            const { mockUser } = await mockBasicUser({
                user: {
                    platformId: mockPlatform.id,
                    platformRole: PlatformRole.MEMBER,
                },
            })

            const mockProject = await createProjectAndPlan({
                ownerId: mockUser.id,
                platformId: mockPlatform.id,
            })

            const mockPieceMetadataA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
            })
            const mockPieceMetadataB = createMockBlockMetadata({
                name: 'b',
                blockType: BlockType.OFFICIAL,
                displayName: 'b',
            })
            await db.save('block_metadata', [mockPieceMetadataA, mockPieceMetadataB])

            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.USER,

                platform: {
                    id: mockPlatform.id,
                },
                id: mockUser.id,
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/blocks?projectId=${mockProject.id}`,
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(responseBody).toHaveLength(1)
            expect(responseBody?.[0].id).toBe(mockPieceMetadataA.id)
        })

        it('Blocks filtered pieces if platform filter is set to "BLOCKED"', async () => {
            // arrange
            const { mockPlatform } = await mockAndSaveBasicSetup({
                platform: {
                    filteredBlockNames: ['a'],
                    filteredBlockBehavior: FilteredBlockBehavior.BLOCKED,
                },
            })

            const { mockUser } = await mockBasicUser({
                user: {
                    platformId: mockPlatform.id,
                    platformRole: PlatformRole.MEMBER,
                },
            })

            const mockProject = await createProjectAndPlan({
                ownerId: mockUser.id,
                platformId: mockPlatform.id,
            })

            const mockPieceMetadataA = createMockBlockMetadata({
                name: 'a',
                blockType: BlockType.OFFICIAL,
                displayName: 'a',
            })
            const mockPieceMetadataB = createMockBlockMetadata({
                name: 'b',
                blockType: BlockType.OFFICIAL,
                displayName: 'b',
            })
            await db.save('block_metadata', [mockPieceMetadataA, mockPieceMetadataB])

            await blockCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.USER,

                platform: {
                    id: mockPlatform.id,
                },
                id: mockUser.id,
            })

            // act
            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/blocks?projectId=${mockProject.id}`,
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            // assert
            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(responseBody).toHaveLength(1)
            expect(responseBody?.[0].id).toBe(mockPieceMetadataB.id)
        })
    })
})

async function createProjectAndPlan({
    platformId,
    ownerId,
    blocksFilterType,
    blocks,
}: {
    platformId: string
    ownerId: string
    blocksFilterType?: BlocksFilterType
    blocks?: string[]
}) {
    const project = createMockProject({
        platformId,
        ownerId,
    })
    await db.save('project', [project])

    const projectPlan = createMockPlan({
        projectId: project.id,
        blocksFilterType,
        blocks,
    })
    await db.save('project_plan', [projectPlan])
    return project
}