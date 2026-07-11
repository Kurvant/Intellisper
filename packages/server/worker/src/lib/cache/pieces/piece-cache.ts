import path from 'path'
import { IbEnvironment, EXACT_VERSION_REGEX, PackageType, BlockPackage, BlockType, WorkerToApiContract } from '@intelblocks/shared'
import { trace } from '@opentelemetry/api'
import { Logger } from 'pino'
import { workerSettings } from '../../config/worker-settings'
import { getGlobalCacheBlocksPath } from '../cache-paths'
import { cacheState, NO_SAVE_GUARD } from '../cache-state'

const tracer = trace.getTracer('piece-cache')

export const blockCache = (log: Logger, apiClient: WorkerToApiContract) => ({
    async getBlock({ blockName, blockVersion, platformId }: BlockCacheKey): Promise<BlockPackage> {
        const isExactVersion = EXACT_VERSION_REGEX.test(blockVersion)

        if (!isExactVersion) {
            return getBlockPackage({ blockName, blockVersion, platformId }, apiClient)
        }

        const cacheKey = `${blockName}-${blockVersion}-${platformId}`
        const cache = cacheState(path.join(getGlobalCacheBlocksPath(), cacheKey))

        const { state } = await cache.getOrSetCache({
            key: cacheKey,
            cacheMiss: (_: string) => {
                const environment = workerSettings.getSettings().ENVIRONMENT
                if (environment === IbEnvironment.TESTING) {
                    return true
                }
                const devBlocks = workerSettings.getSettings().DEV_BLOCKS
                if (devBlocks.includes(blockName)) {
                    return true
                }
                return false
            },
            installFn: async () => {
                return tracer.startActiveSpan('pieceCache.fetchPiece', async (span) => {
                    try {
                        span.setAttribute('piece.name', blockName)
                        span.setAttribute('piece.version', blockVersion)
                        const blockPackage = await getBlockPackage({ blockName, blockVersion, platformId }, apiClient)
                        log.info({ blockName, blockVersion, platformId }, 'Cached piece')
                        return JSON.stringify(blockPackage)
                    }
                    finally {
                        span.end()
                    }
                })
            },
            skipSave: NO_SAVE_GUARD,
        })

        return JSON.parse(state as string) as BlockPackage
    },
})

async function getBlockPackage(query: BlockCacheKey, apiClient: WorkerToApiContract): Promise<BlockPackage> {
    const blockMetadata = await apiClient.getBlock({
        name: query.blockName,
        version: query.blockVersion,
        platformId: query.platformId,
    }) as { packageType: PackageType, name: string, version: string, blockType: BlockType, archiveId?: string } | null

    if (!blockMetadata) {
        throw new BlockNotFoundError(query.blockName, query.blockVersion)
    }

    const baseProps = {
        packageType: blockMetadata.packageType,
        blockName: blockMetadata.name,
        blockVersion: blockMetadata.version,
        blockType: blockMetadata.blockType,
    }

    if (blockMetadata.packageType === PackageType.ARCHIVE) {
        return {
            ...baseProps,
            archiveId: blockMetadata.archiveId!,
            platformId: query.platformId,
        } as BlockPackage
    }

    if (blockMetadata.blockType === BlockType.CUSTOM) {
        return {
            ...baseProps,
            platformId: query.platformId,
        } as BlockPackage
    }

    return baseProps as BlockPackage
}

export class BlockNotFoundError extends Error {
    constructor(blockName: string, blockVersion: string) {
        super(`Block metadata not found for ${blockName}@${blockVersion}`)
        this.name = 'PieceNotFoundError'
    }
}

type BlockCacheKey = {
    blockName: string
    blockVersion: string
    platformId: string
}
