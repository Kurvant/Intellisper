/**
 * Publishes locally-built block metadata into a running Intellisper instance's catalogue.
 *
 * This is the Intellisper equivalent of upstream's `tools/scripts/pieces/update-pieces-metadata.ts`,
 * which POSTs each piece's metadata to `cloud.activepieces.com/api/v1/admin/pieces` after the
 * release pipeline publishes the packages. We are the ORIGIN of our own catalogue (blocks are
 * published to GitHub Packages as `@intelblocks/block-*`, and there is no upstream catalogue to
 * sync down), so this script is how `block_metadata` gets populated and kept current.
 *
 * Only METADATA crosses the wire — never block code. At execution time the worker resolves each
 * package by name/version from the registry and installs it into a sandbox.
 *
 * Usage (from the repository root, after the blocks have been built):
 *
 *   IB_INSTANCE_URL=https://cloud.intellisper.com \
 *   IB_API_KEY=<operator key> \
 *   npx tsx tools/scripts/blocks/publish-blocks-metadata.ts
 *
 * Idempotent: a block whose (name, version) already exists comes back 409 and is counted as
 * "already present", exactly as upstream treats CONFLICT as success. Re-running is safe and is
 * the intended way to add newly-published blocks later.
 */
import { fileBlocksUtils } from '../../../packages/server/api/src/app/pieces/metadata/utils/file-pieces-utils'

type MinimalLogger = {
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
}

// The loader expects a fastify-style logger; a console shim is enough for a CLI run.
const log = {
    info: (...args: unknown[]) => console.info(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args),
    debug: () => undefined,
    trace: () => undefined,
    fatal: (...args: unknown[]) => console.error(...args),
    child: () => log,
    level: 'info',
} as unknown as Parameters<typeof fileBlocksUtils>[0] & MinimalLogger

const INSTANCE_URL = (process.env.IB_INSTANCE_URL ?? '').replace(/\/+$/, '')
const API_KEY = process.env.IB_API_KEY ?? ''
// Concurrency is deliberately modest: each create() does several DB round trips, and the goal is a
// reliable one-shot seed, not maximum throughput against production.
const BATCH_SIZE = Number(process.env.IB_PUBLISH_BATCH_SIZE ?? 10)

if (INSTANCE_URL.length === 0 || API_KEY.length === 0) {
    console.error('IB_INSTANCE_URL and IB_API_KEY must both be set.')
    process.exit(1)
}

type Result = 'created' | 'exists' | 'failed'

async function publishOne(block: { name: string, version: string }): Promise<Result> {
    const response = await fetch(`${INSTANCE_URL}/api/v1/admin/blocks`, {
        method: 'POST',
        headers: {
            'api-key': API_KEY,
            'content-type': 'application/json',
        },
        body: JSON.stringify(block),
    })

    if (response.status === 200) {
        return 'created'
    }
    if (response.status === 409) {
        return 'exists'
    }
    const body = await response.text().catch(() => '')
    console.error(`  FAILED ${block.name}@${block.version} -> HTTP ${response.status} ${body.slice(0, 200)}`)
    return 'failed'
}

async function main(): Promise<void> {
    console.info(`Loading metadata for locally built blocks...`)
    const blocks = await fileBlocksUtils(log).loadAllDistBlocksMetadata()

    if (blocks.length === 0) {
        console.error('No built blocks found. Build them first: npx turbo run build --filter="./packages/blocks/**"')
        process.exit(1)
    }

    console.info(`Found ${blocks.length} blocks. Publishing to ${INSTANCE_URL} ...`)

    const counts: Record<Result, number> = { created: 0, exists: 0, failed: 0 }
    const failures: string[] = []

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batch = blocks.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(batch.map(async (block) => {
            const result = await publishOne(block as unknown as { name: string, version: string })
            if (result === 'failed') {
                failures.push(`${block.name}@${block.version}`)
            }
            return result
        }))
        results.forEach((r) => { counts[r] += 1 })
        const done = Math.min(i + BATCH_SIZE, blocks.length)
        console.info(`  ${done}/${blocks.length}  created=${counts.created} exists=${counts.exists} failed=${counts.failed}`)
    }

    console.info(`\nDone. created=${counts.created} already-present=${counts.exists} failed=${counts.failed}`)
    if (failures.length > 0) {
        console.error(`Failed blocks:\n  ${failures.join('\n  ')}`)
        // A partial publish must not look like success to CI.
        process.exit(1)
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
