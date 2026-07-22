import { BlockType, ibId, isEmpty, isNil, PackageType } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import semVer from 'semver'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { BlockRegistryEntry } from '../piece-cache'
import { BlockMetadataSchema } from '../piece-metadata-entity'
import { fileBlocksUtils } from './file-pieces-utils'

export function isNewerVersion(a: string, b: string): boolean {
    const aValid = semVer.valid(a)
    const bValid = semVer.valid(b)
    if (!aValid && !bValid) {
        return a.localeCompare(b) > 0
    }
    if (!aValid) {
        return false
    }
    if (!bValid) {
        return true
    }
    return semVer.gt(a, b)
}

export function lastVersionOfEachBlock(blocks: BlockMetadataSchema[]): BlockMetadataSchema[] {
    const seen = new Map<string, BlockMetadataSchema>()
    for (const block of blocks) {
        const existing = seen.get(block.name)
        if (isNil(existing) || isNewerVersion(block.version, existing.version)) {
            seen.set(block.name, block)
        }
    }
    return Array.from(seen.values())
}

let devBlocksCachePromise: Promise<BlockMetadataSchema[]> | null = null

export function invalidateDevBlockCache(): void {
    devBlocksCachePromise = null
}

export async function loadDevBlocksIfEnabled(log: FastifyBaseLogger): Promise<BlockMetadataSchema[]> {
    const devBlocksConfig = system.get(AppSystemProp.DEV_BLOCKS)
    if (isNil(devBlocksConfig) || isEmpty(devBlocksConfig)) {
        return []
    }
    if (devBlocksCachePromise) {
        return devBlocksCachePromise
    }
    devBlocksCachePromise = loadDevBlocks(log, devBlocksConfig)
    devBlocksCachePromise.catch(() => {
        devBlocksCachePromise = null
    })
    return devBlocksCachePromise
}

async function loadDevBlocks(log: FastifyBaseLogger, devBlocksConfig: string): Promise<BlockMetadataSchema[]> {
    const blocksNames = devBlocksConfig.split(',')
    const blocks = await fileBlocksUtils(log).loadDistBlocksMetadata(blocksNames)

    return blocks.map((p): BlockMetadataSchema => ({
        id: ibId(),
        ...p,
        projectUsage: 0,
        blockType: BlockType.OFFICIAL,
        packageType: PackageType.REGISTRY,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
    }))
}

export function filterBlockBasedOnType(platformId: string | undefined, block: BlockMetadataSchema | BlockRegistryEntry): boolean {
    return isOfficialBlock(block) || isCustomBlock(platformId, block)
}

export function isOfficialBlock(block: BlockMetadataSchema | BlockRegistryEntry): boolean {
    return block.blockType === BlockType.OFFICIAL && isNil(block.platformId)
}

export function isCustomBlock(platformId: string | undefined, block: BlockMetadataSchema | BlockRegistryEntry): boolean {
    if (isNil(platformId)) {
        return false
    }
    return block.platformId === platformId && block.blockType === BlockType.CUSTOM
}

export function isSupportedRelease(release: string | undefined, block: { minimumSupportedRelease?: string, maximumSupportedRelease?: string }): boolean {
    if (isNil(release) || !semVer.valid(release)) {
        return true
    }
    if (!isNil(block.maximumSupportedRelease) && semVer.valid(block.maximumSupportedRelease) && semVer.compare(release, block.maximumSupportedRelease) === 1) {
        return false
    }
    if (!isNil(block.minimumSupportedRelease) && semVer.valid(block.minimumSupportedRelease) && semVer.compare(release, block.minimumSupportedRelease) === -1) {
        return false
    }
    return true
}
