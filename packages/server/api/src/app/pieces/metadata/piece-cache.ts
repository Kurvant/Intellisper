import { BlockType, IbEnvironment, isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { pubsub } from '../../helper/pubsub'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { BlockMetadataEntity, BlockMetadataSchema } from './piece-metadata-entity'
import { loadDevBlocksIfEnabled } from './utils'

const repo = repoFactory(BlockMetadataEntity)
const environment = system.get<IbEnvironment>(AppSystemProp.ENVIRONMENT)
const isTestingEnvironment = environment === IbEnvironment.TESTING

let cachedRegistry: BlockRegistryEntry[] | null = null
let registryGeneration = 0

export const blockCache = (log: FastifyBaseLogger) => {
    return {
        async setup(): Promise<void> {
            log.info('[pieceCache] Registry cache initialized')
            if (!isTestingEnvironment) {
                await pubsub.subscribe(PIECE_REGISTRY_INVALIDATION_CHANNEL, () => {
                    cachedRegistry = null
                    registryGeneration++
                    log.debug('[pieceCache] Registry invalidated via pubsub')
                })
            }
        },

        async loadRegistry(): Promise<BlockRegistryEntry[]> {
            const persistedRegistry = await loadPersistedRegistry()
            const devBlocks = (await loadDevBlocksIfEnabled(log)).map(toRegistryEntry)
            return [...persistedRegistry, ...devBlocks]
        },

        async invalidate(): Promise<void> {
            cachedRegistry = null
            registryGeneration++
            if (!isTestingEnvironment) {
                await pubsub.publish(PIECE_REGISTRY_INVALIDATION_CHANNEL, '1')
            }
        },
    }
}

async function loadPersistedRegistry(): Promise<BlockRegistryEntry[]> {
    if (isTestingEnvironment) {
        return fetchRegistryFromDB()
    }
    if (!isNil(cachedRegistry)) {
        return cachedRegistry
    }
    const startGeneration = registryGeneration
    const result = await fetchRegistryFromDB()
    if (registryGeneration !== startGeneration) {
        return loadPersistedRegistry()
    }
    cachedRegistry = result
    return result
}

function toRegistryEntry(block: BlockMetadataSchema): BlockRegistryEntry {
    return {
        name: block.name,
        version: block.version,
        minimumSupportedRelease: block.minimumSupportedRelease,
        maximumSupportedRelease: block.maximumSupportedRelease,
        platformId: block.platformId,
        blockType: block.blockType,
    }
}

async function fetchRegistryFromDB(): Promise<BlockRegistryEntry[]> {
    return repo()
        .createQueryBuilder('pm')
        .select(['pm."name"', 'pm."version"', 'pm."platformId"', 'pm."blockType"', 'pm."minimumSupportedRelease"', 'pm."maximumSupportedRelease"'])
        .getRawMany<BlockRegistryEntry>()
}

export const PIECE_REGISTRY_INVALIDATION_CHANNEL = 'piece-registry-invalidation'

export type BlockRegistryEntry = {
    platformId?: string
    blockType: BlockType
    name: string
    version: string
    minimumSupportedRelease?: string
    maximumSupportedRelease?: string
}
