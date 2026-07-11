import { BlockMetadata } from '@intelblocks/blocks-framework'
import { ibVersionUtil } from '@intelblocks/server-utils'
import { groupBy, isNil, PackageType, BlockSyncMode, BlockType, tryCatch } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { blockCache } from './metadata/piece-cache'
import { BlockMetadataSchema } from './metadata/piece-metadata-entity'
import { blockMetadataService, blockRepos } from './metadata/piece-metadata-service'

// No hardcoded Intellisper cloud URL in this edition. The registry host is
// operator-controlled via IB_BLOCKS_REGISTRY_URL and only used when
// BLOCKS_SYNC_MODE === OFFICIAL_AUTO. With the default mode (NONE) — or NPM, or
// a missing URL — this service never makes an outbound registry request.
const registryUrl = system.get(AppSystemProp.BLOCKS_REGISTRY_URL)
const syncMode = system.get<BlockSyncMode>(AppSystemProp.BLOCKS_SYNC_MODE)

function getBlocksRegistryUrl(): string | undefined {
    if (syncMode !== BlockSyncMode.OFFICIAL_AUTO) {
        return undefined
    }
    if (!registryUrl || registryUrl.trim().length === 0) {
        return undefined
    }
    return registryUrl.replace(/\/+$/, '')
}

export const blockSyncService = (log: FastifyBaseLogger) => ({
    async setup(): Promise<void> {
        systemJobHandlers.registerJobHandler(SystemJobName.BLOCKS_SYNC, async function syncBlocksJobHandler(): Promise<void> {
            await blockSyncService(log).sync({ publishCacheRefresh: true })
        })
        rejectedPromiseHandler(blockSyncService(log).sync({ publishCacheRefresh: false }), log)
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.BLOCKS_SYNC,
                data: {},
                jobId: SystemJobName.BLOCKS_SYNC,
            },
            schedule: {
                type: 'repeated',
                cron: `${Math.floor(Math.random() * 5)} */1 * * *`,
            },
        })
    },
    async sync({ publishCacheRefresh }: { publishCacheRefresh: boolean }): Promise<void> {
        const baseUrl = getBlocksRegistryUrl()
        if (isNil(baseUrl)) {
            log.info({ syncMode }, 'Block registry sync is disabled (no configured registry URL)')
            return
        }
        try {
            log.info('Starting piece synchronization')
            const startTime = performance.now()
            const [dbBlocks, cloudBlocks] = await Promise.all([blockRepos().find({
                select: {
                    name: true,
                    version: true,
                    blockType: true,
                },
            }), listCloudBlocks(baseUrl)])
            log.info({ dbCount: dbBlocks.length, cloudCount: cloudBlocks.length }, 'Fetched pieces from DB and Cloud')
            const added = await installNewBlocks(baseUrl, cloudBlocks, dbBlocks, log, publishCacheRefresh)
            const deleted = await deleteBlocksIfNotOnCloud(dbBlocks, cloudBlocks, log)

            log.info({
                added,
                deleted,
                durationMs: Math.floor(performance.now() - startTime),
            }, 'Block synchronization completed')
        }
        catch (error) {
            log.error({ error }, 'Error syncing pieces')
        }
    },
})

// Exported for testing: the empty-response guard below protects the whole catalog
// from being deleted, so it is covered by a regression test.
export async function deleteBlocksIfNotOnCloud(dbBlocks: BlockMetadataOnly[], cloudBlocks: BlockRegistryResponse[], log: FastifyBaseLogger): Promise<number> {
    // An empty registry response is never a valid instruction to prune. A misconfigured
    // registry URL, a wrong edition/release query, or a proxy answering 200 with `[]`
    // would otherwise delete every OFFICIAL row and wipe the catalog. Only a response
    // that actually advertises blocks may be treated as authoritative.
    if (cloudBlocks.length === 0) {
        log.warn('Block registry returned no blocks; skipping prune to avoid wiping the catalog')
        return 0
    }
    const cloudMap = new Map<string, true>(cloudBlocks.map(cloudBlock => [`${cloudBlock.name}:${cloudBlock.version}`, true]))
    const blocksToDelete = dbBlocks.filter(block => block.blockType === BlockType.OFFICIAL && !cloudMap.has(`${block.name}:${block.version}`))
    await blockMetadataService(log).bulkDelete(blocksToDelete.map(block => ({ name: block.name, version: block.version })))
    return blocksToDelete.length
}

async function installNewBlocks(baseUrl: string, cloudBlocks: BlockRegistryResponse[], dbBlocks: BlockMetadataOnly[], log: FastifyBaseLogger, _publishCacheRefresh: boolean): Promise<number> {
    const dbMap = new Map<string, true>(dbBlocks.map(dbBlock => [`${dbBlock.name}:${dbBlock.version}`, true]))
    const newBlocksToFetch = cloudBlocks.filter(block => !dbMap.has(`${block.name}:${block.version}`))
    const batchSize = 5
    for (let done = 0; done < newBlocksToFetch.length; done += batchSize) {
        const currentBatch = newBlocksToFetch.slice(done, done + batchSize)
        await Promise.all(currentBatch.map(async (block) => {
            const url = `${baseUrl}/${block.name}${block.version ? '?version=' + block.version : ''}`
            const response = await fetch(url)
            if (!response.ok) {
                log.warn({ blockName: block.name, version: block.version, status: response.status }, '[pieceSyncService#installNewPieces] Error reading piece metadata')
                return
            }
            const blockMetadata = await response.json() as BlockMetadata & { packageType: PackageType, blockType: BlockType }
            const { error } = await tryCatch(() => blockMetadataService(log).create({
                blockMetadata,
                packageType: blockMetadata.packageType,
                blockType: blockMetadata.blockType,
                publishCacheRefresh: false,
            }))
            if (error) {
                log.debug({ blockName: block.name, version: block.version }, '[pieceSyncService#installNewPieces] Block already exists, skipping')
            }
        }))
    }
    if (newBlocksToFetch.length > 0) {
        await blockCache(log).invalidate()
    }
    return newBlocksToFetch.length
}


async function listCloudBlocks(baseUrl: string): Promise<BlockRegistryResponse[]> {
    const queryParams = new URLSearchParams()
    queryParams.append('edition', system.getEdition())
    queryParams.append('release', ibVersionUtil.getCurrentRelease())
    const response = await fetch(`${baseUrl}/registry?${queryParams.toString()}`)
    if (!response.ok) {
        throw new Error(`Failed to fetch cloud pieces: ${response.status}`)
    }
    const blocks = await response.json() as BlockRegistryResponse[]
    const blocksByName = groupBy(blocks, p => p.name)
    const latest = []
    const others = []

    for (const group of Object.values(blocksByName)) {
        const sortedByVersion = sortByVersionDesc(group)
        latest.push(sortedByVersion[0])
        others.push(...sortedByVersion.slice(1))
    }

    return [...latest, ...others]
}

function sortByVersionDesc(items: BlockRegistryResponse[]) {
    return [...items].sort((a, b) =>
        semver.rcompare(a.version, b.version),
    )
}

type BlockRegistryResponse = {
    name: string
    version: string
}


type BlockMetadataOnly = Pick<BlockMetadataSchema, 'name' | 'version' | 'blockType'>
