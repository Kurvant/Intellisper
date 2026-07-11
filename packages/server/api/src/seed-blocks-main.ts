import { BlockMetadata } from '@intelblocks/blocks-framework'
import { ibId, isNil, PackageType, BlockType } from '@intelblocks/shared'
import { databaseConnection } from './app/database/database-connection'
import { system } from './app/helper/system/system'
import { BlockMetadataEntity, BlockMetadataSchema } from './app/pieces/metadata/piece-metadata-entity'
import { fileBlocksUtils } from './app/pieces/metadata/utils/file-pieces-utils'

/**
 * Seeds `block_metadata` from the locally built blocks.
 *
 * Why this is a standalone process and not a boot-time seed: extracting a block's
 * metadata requires `require()`-ing its module. The API must never hold block code
 * in its address space — that is what keeps the API light regardless of catalog
 * size, and keeps untrusted third-party dependency trees out of the request-serving
 * process. This script loads the modules, writes plain JSON rows, and exits.
 *
 * Rows are written as blockType=OFFICIAL / packageType=REGISTRY with a null
 * platformId, which is exactly what `isOfficialBlock` requires for a block to be
 * visible in every project's catalog. No block code is stored — at execution time
 * the worker resolves the package by name/version and installs it into a sandbox.
 *
 * Idempotent: re-running upserts on the unique (name, version, platformId) index.
 *
 * Run from the repository root (block discovery resolves paths relative to cwd).
 */

const log = system.globalLogger()

async function seedBlocks(): Promise<void> {
    log.info('Connecting to the database')
    // Migrations are owned by the API's own startup path; this script only writes rows.
    await databaseConnection().initialize()

    log.info('Loading metadata for locally built blocks')
    const blocks = await fileBlocksUtils(log).loadAllDistBlocksMetadata()

    if (blocks.length === 0) {
        log.error('No built blocks were found. Build the blocks first, e.g. `npx turbo run build --filter="./packages/blocks/**"`')
        await databaseConnection().destroy()
        process.exit(1)
    }

    const repo = databaseConnection().getRepository(BlockMetadataEntity)
    let seeded = 0
    let skipped = 0
    const failed: string[] = []

    for (const block of blocks) {
        try {
            const existing = await repo.findOneBy({
                name: block.name,
                version: block.version,
            })
            if (!isNil(existing)) {
                skipped++
                continue
            }
            await repo.save(toOfficialRegistryRow(block))
            seeded++
        }
        catch (error) {
            // One malformed block must not abort the remaining catalog.
            failed.push(block.name)
            log.warn({ error, blockName: block.name }, 'Failed to seed block; continuing')
        }
    }

    log.info({ discovered: blocks.length, seeded, alreadyPresent: skipped, failed: failed.length }, 'Block metadata seeding completed')
    if (failed.length > 0) {
        log.warn({ failed }, 'Some blocks could not be seeded')
    }
    await databaseConnection().destroy()
}

function toOfficialRegistryRow(block: BlockMetadata): BlockMetadataSchema {
    const now = new Date().toISOString()
    return {
        id: ibId(),
        ...block,
        // Both columns are NOT NULL, but a block need not declare either bound.
        // Defaulted the same way blockInstallService does when registering a block.
        minimumSupportedRelease: block.minimumSupportedRelease ?? '0.0.0',
        maximumSupportedRelease: block.maximumSupportedRelease ?? '999.999.999',
        // No platformId: an OFFICIAL block is visible to every project.
        projectUsage: 0,
        blockType: BlockType.OFFICIAL,
        packageType: PackageType.REGISTRY,
        created: now,
        updated: now,
    }
}

seedBlocks()
    .then(() => process.exit(0))
    .catch((error) => {
        log.error({ error }, 'Failed to seed block metadata')
        process.exit(1)
    })
