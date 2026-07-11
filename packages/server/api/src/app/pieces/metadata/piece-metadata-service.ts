import { BlockMetadata, BlockMetadataModel, BlockMetadataModelSummary, BlockPackageInformation, blockTranslation } from '@intelblocks/blocks-framework'
import { ibVersionUtil } from '@intelblocks/server-utils'
import {
    IntellisperError,
    ibId,
    assertNotNullOrUndefined,
    ErrorCode,
    EXACT_VERSION_REGEX,
    isNil,
    LocalesEnum,
    PackageType,
    BlockCategory,
    BlockOrderBy,
    BlockPackage,
    BlockSortBy,
    BlockType,
    PlatformId,
    PrivateBlockPackage,
    PublicBlockPackage,
    SuggestionType,
} from '@intelblocks/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import semVer from 'semver'
import { EntityManager, In, IsNull } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { enterpriseFilteringUtils } from '../../enterprise/pieces/filters/piece-filtering-utils'
import { blockTagService } from '../tags/pieces/piece-tag.service'
import { blockCache, BlockRegistryEntry } from './piece-cache'
import { BlockMetadataEntity, BlockMetadataSchema } from './piece-metadata-entity'
import { filterBlockBasedOnType, isNewerVersion, isSupportedRelease, lastVersionOfEachBlock, loadDevBlocksIfEnabled, blockListUtils } from './utils'

export const blockRepos = repoFactory(BlockMetadataEntity)

export const blockMetadataService = (log: FastifyBaseLogger) => {
    return {
        async setup(): Promise<void> {
            await blockCache(log).setup()
        },
        async list(params: ListParams): Promise<BlockMetadataModelSummary[]> {
            const locale = params.locale ?? LocalesEnum.ENGLISH
            const translatedBlocks = await dedupe(`list:${params.platformId ?? ''}:${locale}`, () => fetchLatestBlocks({
                platformId: params.platformId,
                locale,
                log,
            }))
            const blocksWithTags = await enrichTags(params.platformId, translatedBlocks, params.includeTags)
            const filteredBlocks = await blockListUtils(log).filterBlocks({
                ...params,
                blocks: blocksWithTags,
                suggestionType: params.suggestionType,
            })

            return toBlockMetadataModelSummary(filteredBlocks, translatedBlocks, params.suggestionType)
        },
        async registry(params: RegistryParams): Promise<BlockPackageInformation[]> {
            const registry = filterRegistry(await loadRegistry(log), {
                release: params.release,
                platformId: params.platformId,
            })
            return registry.map((block) => ({
                name: block.name,
                version: block.version,
            }))
        },
        async get({ projectId, platformId, version, name }: GetOrThrowParams): Promise<BlockMetadataModel | undefined> {
            const bestMatch = await findExactVersion(log, { name, version, platformId })
            if (isNil(bestMatch)) {
                return undefined
            }
            const block = await dedupe(`piece:${bestMatch.name}:${bestMatch.version}:${bestMatch.platformId ?? ''}`, () => fetchBlockVersion({
                blockName: bestMatch.name,
                version: bestMatch.version,
                platformId: bestMatch.platformId,
                log,
            }))

            if (isNil(block)) {
                return undefined
            }

            const isFiltered = await enterpriseFilteringUtils(log).isFiltered({
                block,
                projectId,
                platformId,
            })
            if (isFiltered) {
                return undefined
            }
            return block
        },
        async getOrThrow({ version, name, platformId, locale }: GetOrThrowParams): Promise<BlockMetadataModel> {
            const block = await this.get({ version, name, platformId })
            if (isNil(block)) {
                throw new IntellisperError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        message: `piece_metadata_not_found pieceName=${name}`,
                    },
                })
            }
            if (isNil(locale) || locale === LocalesEnum.ENGLISH) {
                return block
            }
            return blockTranslation.translateBlock<BlockMetadataModel>({ piece: block, locale, mutate: false })
        },
        async updateUsage({ id, usage }: UpdateUsage): Promise<void> {
            const existingMetadata = await blockRepos().findOneByOrFail({
                id,
            })
            await blockRepos().update(id, {
                projectUsage: usage,
                updated: existingMetadata.updated,
                created: existingMetadata.created,
            })
        },
        async resolveExactVersion({ name, version, platformId }: GetExactBlockVersionParams): Promise<string> {
            const isExactVersion = EXACT_VERSION_REGEX.test(version)

            if (isExactVersion) {
                return version
            }

            const blockMetadata = await this.getOrThrow({
                name,
                version,
                platformId,
            })

            return blockMetadata.version
        },
        async create({
            blockMetadata,
            platformId,
            packageType,
            blockType,
            archiveId,
            publishCacheRefresh = true,
        }: CreateParams): Promise<BlockMetadataSchema> {
            const existingMetadata = await blockRepos().findOneBy({
                name: blockMetadata.name,
                version: blockMetadata.version,
                platformId: platformId ?? IsNull(),
            })
            if (!isNil(existingMetadata)) {
                throw new IntellisperError({
                    code: ErrorCode.VALIDATION,
                    params: {
                        message: `piece_metadata_already_exists name=${blockMetadata.name} version=${blockMetadata.version}`,
                    },
                })
            }
            const createdDate = await findOldestCreatedDate({
                name: blockMetadata.name,
                platformId,
            })
            const savedBlock = await blockRepos().save({
                id: ibId(),
                packageType,
                blockType,
                archiveId,
                platformId,
                created: createdDate,
                ...blockMetadata,
            })
            if (publishCacheRefresh) {
                await blockCache(log).invalidate()
            }
            return savedBlock
        },

        async bulkDelete(blocks: { name: string, version: string }[]): Promise<void> {
            const results = await Promise.all(blocks.map((block) =>
                blockRepos().delete({ name: block.name, version: block.version }),
            ))
            const anyDeleted = results.some((result) => !isNil(result.affected) && result.affected > 0)
            if (anyDeleted) {
                await blockCache(log).invalidate()
            }
        },
    }
}

export const getBlockPackageWithoutArchive = async (
    log: FastifyBaseLogger,
    platformId: PlatformId | undefined,
    pkg: Omit<PublicBlockPackage, 'directoryPath' | 'blockType' | 'packageType'> | Omit<PrivateBlockPackage, 'archiveId' | 'archive' | 'blockType' | 'packageType'>,
): Promise<BlockPackage> => {
    const blockMetadata = await blockMetadataService(log).getOrThrow({
        name: pkg.blockName,
        version: pkg.blockVersion,
        platformId,
    })
    switch (blockMetadata.packageType) {
        case PackageType.ARCHIVE:
            assertNotNullOrUndefined(blockMetadata.platformId, 'platformId is required')
            return {
                blockName: blockMetadata.name,
                blockVersion: blockMetadata.version,
                blockType: blockMetadata.blockType,
                packageType: blockMetadata.packageType,
                archiveId: blockMetadata.archiveId!,
                platformId: blockMetadata.platformId,
            }
        case PackageType.REGISTRY: {
            const blockPlatformId = blockMetadata.platformId
            if (blockMetadata.blockType === BlockType.CUSTOM) {
                assertNotNullOrUndefined(blockPlatformId, 'platformId is required')
                return {
                    blockName: blockMetadata.name,
                    blockVersion: blockMetadata.version,
                    packageType: blockMetadata.packageType,
                    blockType: blockMetadata.blockType,
                    platformId: blockPlatformId,
                }
            }
            return {
                blockName: blockMetadata.name,
                blockVersion: blockMetadata.version,
                packageType: blockMetadata.packageType,
                blockType: blockMetadata.blockType,
            }
        }
    }
}

export function toBlockMetadataModelSummary<T extends BlockMetadataSchema | BlockMetadataModel>(
    blockMetadataEntityList: T[],
    originalMetadataList: T[],
    suggestionType?: SuggestionType,
): BlockMetadataModelSummary[] {
    return blockMetadataEntityList.map((blockMetadataEntity) => {
        const originalMetadata = originalMetadataList.find((p) => p.name === blockMetadataEntity.name)
        assertNotNullOrUndefined(originalMetadata, `Original metadata not found for ${blockMetadataEntity.name}`)
        return {
            ...blockMetadataEntity,
            actions: Object.keys(originalMetadata.actions).length,
            triggers: Object.keys(originalMetadata.triggers).length,
            suggestedActions: suggestionType === SuggestionType.ACTION || suggestionType === SuggestionType.ACTION_AND_TRIGGER ?
                Object.values(blockMetadataEntity.actions) : undefined,
            suggestedTriggers: suggestionType === SuggestionType.TRIGGER || suggestionType === SuggestionType.ACTION_AND_TRIGGER ?
                Object.values(blockMetadataEntity.triggers) : undefined,
        }
    })
}

const findOldestCreatedDate = async ({ name, platformId }: { name: string, platformId?: string }): Promise<string> => {
    const block = await blockRepos().findOne({
        where: {
            name,
            platformId: platformId ?? IsNull(),
        },
        order: {
            created: 'ASC',
        },
    })
    return block?.created ?? dayjs().toISOString()
}

const enrichTags = async (platformId: string | undefined, blocks: BlockMetadataSchema[], includeTags: boolean | undefined): Promise<BlockMetadataSchema[]> => {
    if (!includeTags || isNil(platformId)) {
        return blocks
    }
    const tags = await blockTagService.findByPlatform(platformId)
    return blocks.map((block) => {
        return {
            ...block,
            tags: tags[block.name] ?? [],
        }
    })
}

const sortByVersionDescending = <T extends { version: string }>(a: T, b: T): number => {
    const aValid = semVer.valid(a.version)
    const bValid = semVer.valid(b.version)
    if (!aValid && !bValid) {
        return b.version.localeCompare(a.version)
    }
    if (!aValid) {
        return 1
    }
    if (!bValid) {
        return -1
    }
    return semVer.rcompare(a.version, b.version)
}

const findExactVersion = async (
    log: FastifyBaseLogger,
    params: { name: string, version: string | undefined, platformId: string | undefined },
): Promise<{ name: string, version: string, platformId: string | undefined } | undefined> => {
    const { name, version, platformId } = params
    const versionToSearch = findNextExcludedVersion(version)
    const currentRelease = ibVersionUtil.getCurrentRelease()
    const registry = filterRegistry(await loadRegistry(log), { release: currentRelease, platformId })
    const matchingRegistryEntries = registry.filter((entry) => {
        if (entry.name !== name) {
            return false
        }
        if (isNil(versionToSearch)) {
            return true
        }
        return semVer.compare(entry.version, versionToSearch.nextExcludedVersion) < 0
            && semVer.compare(entry.version, versionToSearch.baseVersion) >= 0
    })

    if (matchingRegistryEntries.length === 0) {
        return undefined
    }

    const sortedEntries = matchingRegistryEntries.sort(sortByVersionDescending)
    return {
        name: sortedEntries[0].name,
        version: sortedEntries[0].version,
        platformId: sortedEntries[0].platformId,
    }
}

const findNextExcludedVersion = (version: string | undefined): { baseVersion: string, nextExcludedVersion: string } | undefined => {
    if (version?.startsWith('^')) {
        const baseVersion = version.substring(1)
        return {
            baseVersion,
            nextExcludedVersion: increaseMajorVersion(baseVersion),
        }
    }
    if (version?.startsWith('~')) {
        const baseVersion = version.substring(1)
        return {
            baseVersion,
            nextExcludedVersion: increaseMinorVersion(baseVersion),
        }
    }
    if (isNil(version)) {
        return undefined
    }
    return {
        baseVersion: version,
        nextExcludedVersion: increasePatchVersion(version),
    }
}

const increasePatchVersion = (version: string): string => {
    const incrementedVersion = semVer.inc(version, 'patch')
    if (isNil(incrementedVersion)) {
        throw new Error(`Failed to increase patch version ${version}`)
    }
    return incrementedVersion
}

const increaseMinorVersion = (version: string): string => {
    const incrementedVersion = semVer.inc(version, 'minor')
    if (isNil(incrementedVersion)) {
        throw new Error(`Failed to increase minor version ${version}`)
    }
    return incrementedVersion
}

const increaseMajorVersion = (version: string): string => {
    const incrementedVersion = semVer.inc(version, 'major')
    if (isNil(incrementedVersion)) {
        throw new Error(`Failed to increase major version ${version}`)
    }
    return incrementedVersion
}

async function fetchLatestBlocks({ platformId, locale = LocalesEnum.ENGLISH, log }: FetchLatestBlocksParams): Promise<BlockMetadataSchema[]> {
    const currentRelease = ibVersionUtil.getCurrentRelease()

    const latestBlocks = await dedupe(`latest-pieces:${currentRelease}`, () => fetchLatestCompatibleBlocksFromDB(currentRelease))
    const translatedBlocks = translateBlocks(latestBlocks, locale)

    const devBlocks = await loadDevBlocksIfEnabled(log)
    const translatedDevBlocks = devBlocks.map((block) =>
        blockTranslation.translateBlock<BlockMetadataSchema>({ piece: block, locale, mutate: true }),
    )

    const devBlockNames = new Set(translatedDevBlocks.map((p) => p.name))
    const merged = [...translatedBlocks.filter((p) => !devBlockNames.has(p.name)), ...translatedDevBlocks]
        .filter((block) => filterBlockBasedOnType(platformId, block))
        .filter((block) => isSupportedRelease(currentRelease, block))
    return lastVersionOfEachBlock(merged)
}

async function fetchBlockVersion({ blockName, version, platformId, log }: FetchBlockVersionParams): Promise<BlockMetadataSchema | null> {
    const devBlocks = await loadDevBlocksIfEnabled(log)
    const devBlock = devBlocks.find((p) => p.name === blockName && p.version === version)
    if (!isNil(devBlock)) {
        return devBlock
    }

    const foundBlock = await blockRepos().findOne({
        where: {
            name: blockName,
            version,
            platformId: platformId ?? IsNull(),
        },
    })
    return foundBlock ?? null
}

async function fetchLatestCompatibleBlocksFromDB(currentRelease: string): Promise<BlockMetadataSchema[]> {
    const allKeys = await blockRepos()
        .createQueryBuilder('pm')
        .select(['pm."id"', 'pm."name"', 'pm."version"', 'pm."platformId"', 'pm."minimumSupportedRelease"', 'pm."maximumSupportedRelease"'])
        .getRawMany<BlockKey>()

    const compatibleKeys = allKeys.filter((block) => isSupportedRelease(currentRelease, block))
    const latestIds = pickLatestVersionIds(compatibleKeys)
    return latestIds.length > 0 ? blockRepos().find({ where: { id: In(latestIds) } }) : []
}

function pickLatestVersionIds(blocks: BlockKey[]): string[] {
    const latest = new Map<string, BlockKey>()
    for (const block of blocks) {
        const key = `${block.name}:${block.platformId ?? ''}`
        const existing = latest.get(key)
        if (isNil(existing) || isNewerVersion(block.version, existing.version)) {
            latest.set(key, block)
        }
    }
    return Array.from(latest.values()).map((p) => p.id)
}

function translateBlocks(blocks: BlockMetadataSchema[], locale: LocalesEnum): BlockMetadataSchema[] {
    return blocks.map((block) => {
        const translated = locale === LocalesEnum.ENGLISH
            ? { ...block }
            : blockTranslation.translateBlock<BlockMetadataSchema>({ piece: block, locale, mutate: false })
        translated.i18n = undefined
        return translated
    })
}

const inflightFetches = new Map<string, Promise<unknown>>()

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflightFetches.get(key) as Promise<T> | undefined
    if (!isNil(existing)) {
        return existing
    }
    const promise = (async () => {
        try {
            return await fn()
        }
        finally {
            inflightFetches.delete(key)
        }
    })()
    inflightFetches.set(key, promise)
    return promise
}

function loadRegistry(log: FastifyBaseLogger): Promise<BlockRegistryEntry[]> {
    return dedupe('registry-load', () => blockCache(log).loadRegistry())
}

function filterRegistry(registry: BlockRegistryEntry[], params: { release: string | undefined, platformId: string | undefined }): BlockRegistryEntry[] {
    return registry
        .filter((block) => filterBlockBasedOnType(params.platformId, block))
        .filter((block) => isNil(params.release) || isSupportedRelease(params.release, block))
}


// Types

type ListParams = {
    projectId?: string
    platformId?: string
    includeHidden: boolean
    categories?: BlockCategory[]
    includeTags?: boolean
    tags?: string[]
    sortBy?: BlockSortBy
    orderBy?: BlockOrderBy
    searchQuery?: string
    suggestionType?: SuggestionType
    locale?: LocalesEnum
}

type GetOrThrowParams = {
    name: string
    version?: string
    entityManager?: EntityManager
    projectId?: string
    platformId?: string
    locale?: LocalesEnum
}

type CreateParams = {
    blockMetadata: BlockMetadata
    platformId?: string
    projectId?: string
    packageType: PackageType
    blockType: BlockType
    archiveId?: string
    publishCacheRefresh?: boolean
}

type UpdateUsage = {
    id: string
    usage: number
}

type GetExactBlockVersionParams = {
    name: string
    version: string
    platformId: PlatformId
}

type RegistryParams = {
    release: string
    platformId?: string
}

type FetchLatestBlocksParams = {
    platformId?: string
    locale?: LocalesEnum
    log: FastifyBaseLogger
}

type FetchBlockVersionParams = {
    blockName: string
    version: string
    platformId?: string
    log: FastifyBaseLogger
}

type BlockKey = {
    id: string
    name: string
    version: string
    platformId: string | null
    minimumSupportedRelease?: string
    maximumSupportedRelease?: string
}

