/**
 * Publishes locally-built block metadata into a running Intellisper instance's catalogue.
 *
 * This is the Intellisper equivalent of upstream's `tools/scripts/pieces/update-pieces-metadata.ts`,
 * which POSTs each piece's metadata to `cloud.activepieces.com/api/v1/admin/pieces` after the
 * release pipeline publishes the packages. We are the ORIGIN of our own catalogue (blocks are
 * published to GitHub Packages as `@intelblocks/block-*`, and there is no upstream catalogue to
 * sync down), so this script is how `block_metadata` gets populated and kept current.
 *
 * Only METADATA crosses the wire -- never block code. At execution time the worker resolves each
 * package by name/version from the registry and installs it into a sandbox.
 *
 * Deliberately SELF-CONTAINED: it reads the built block folders directly rather than importing the
 * API's `fileBlocksUtils`. That helper reaches into the API's config layer, which pulls in
 * `@intelblocks/server-utils` -- a workspace package that is not built in a blocks-only CI job, so
 * importing it fails with MODULE_NOT_FOUND. The loading logic here mirrors that helper exactly
 * (require the built module, call `metadata()`, override name/version from package.json).
 *
 * Usage (from the repository root, after `turbo run build --filter="./packages/blocks/**"`):
 *
 *   IB_INSTANCE_URL=https://cloud.intellisper.com \
 *   IB_API_KEY=<operator key> \
 *   npx tsx tools/scripts/blocks/publish-blocks-metadata.ts
 *
 * Idempotent: a block whose (name, version) already exists is counted as "already present", so
 * re-running on every deploy is safe and is the intended way to add newly-published blocks.
 */
import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cwd } from 'node:process'

const INSTANCE_URL = (process.env.IB_INSTANCE_URL ?? '').replace(/\/+$/, '')
const API_KEY = process.env.IB_API_KEY ?? ''
// Modest concurrency: each create() does several DB round trips, and the goal is a reliable
// one-shot seed against production, not maximum throughput.
const BATCH_SIZE = Number(process.env.IB_PUBLISH_BATCH_SIZE ?? 10)

if (INSTANCE_URL.length === 0 || API_KEY.length === 0) {
    console.error('IB_INSTANCE_URL and IB_API_KEY must both be set.')
    process.exit(1)
}

const BLOCKS_ROOT = resolve(cwd(), 'packages', 'blocks')

type Result = 'created' | 'exists' | 'failed'

/** Recursively collect every folder that directly contains a package.json. */
async function findBlockFolders(root: string): Promise<string[]> {
    const found: string[] = []
    async function walk(dir: string): Promise<void> {
        let entries
        try {
            entries = await readdir(dir, { withFileTypes: true })
        }
        catch {
            return
        }
        const hasPackageJson = entries.some(e => e.isFile() && e.name === 'package.json')
        if (hasPackageJson) {
            found.push(dir)
            return
        }
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
                await walk(join(dir, entry.name))
            }
        }
    }
    await walk(root)
    return found
}

/** Load a built block's metadata, mirroring the API's own loader. */
function loadBlockMetadata(distPath: string): Record<string, unknown> | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const packageJson = require(join(distPath, 'package.json'))
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const module = require(join(distPath, 'src', 'index'))
        const exported = Object.values(module).find((v): v is { metadata: () => Record<string, unknown> } =>
            typeof v === 'object' && v !== null && typeof (v as { metadata?: unknown }).metadata === 'function')
        if (!exported) {
            return null
        }
        return {
            ...exported.metadata(),
            // package.json is authoritative for identity, exactly as the API's loader treats it.
            name: packageJson.name,
            version: packageJson.version,
        }
    }
    catch (error) {
        console.warn(`  skip ${distPath}: ${(error as Error).message.split('\n')[0]}`)
        return null
    }
}

async function publishOne(metadata: Record<string, unknown>): Promise<Result> {
    const response = await fetch(`${INSTANCE_URL}/api/v1/admin/blocks`, {
        method: 'POST',
        headers: { 'api-key': API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(metadata),
    })

    if (response.status === 200) {
        return 'created'
    }
    const body = await response.text().catch(() => '')
    // Re-publishing an existing (name, version) is normal when this runs on every deploy. The
    // admin route surfaces that as the service's VALIDATION error rather than a 409, so match on
    // the message; treating it as success is what makes the script idempotent.
    if (response.status === 409 || body.includes('already_exists')) {
        return 'exists'
    }
    console.error(`  FAILED ${metadata.name}@${metadata.version} -> HTTP ${response.status} ${body.slice(0, 200)}`)
    return 'failed'
}

async function main(): Promise<void> {
    console.info('Discovering built blocks...')
    const folders = await findBlockFolders(BLOCKS_ROOT)

    const distFolders: string[] = []
    for (const folder of folders) {
        const distPath = join(folder, 'dist')
        try {
            if ((await stat(distPath)).isDirectory()) {
                distFolders.push(distPath)
            }
        }
        catch {
            // Not built; skipped.
        }
    }

    if (distFolders.length === 0) {
        console.error('No built blocks found. Build them first: npx turbo run build --filter="./packages/blocks/**"')
        process.exit(1)
    }

    const all = distFolders.map(loadBlockMetadata).filter((m): m is Record<string, unknown> => m !== null)
    console.info(`Loaded ${all.length} block(s) from ${distFolders.length} dist folder(s). Publishing to ${INSTANCE_URL} ...`)

    if (all.length === 0) {
        console.error('No block metadata could be loaded.')
        process.exit(1)
    }

    const counts: Record<Result, number> = { created: 0, exists: 0, failed: 0 }
    const failures: string[] = []

    for (let i = 0; i < all.length; i += BATCH_SIZE) {
        const batch = all.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(batch.map(async (metadata) => {
            const result = await publishOne(metadata)
            if (result === 'failed') {
                failures.push(`${metadata.name}@${metadata.version}`)
            }
            return result
        }))
        results.forEach((r) => { counts[r] += 1 })
        console.info(`  ${Math.min(i + BATCH_SIZE, all.length)}/${all.length}  created=${counts.created} exists=${counts.exists} failed=${counts.failed}`)
    }

    console.info(`\nDone. created=${counts.created} already-present=${counts.exists} failed=${counts.failed}`)

    // Tolerate a small number of individual failures (a transient network blip on one block should
    // not discard a seed that otherwise published 700+ blocks) but still fail loudly if a large
    // fraction failed -- that indicates a systemic problem (bad schema, wrong URL, auth) worth a
    // red run. The threshold scales with catalogue size.
    if (failures.length > 0) {
        console.error(`Failed blocks (${failures.length}):\n  ${failures.join('\n  ')}`)
        const tolerance = Math.max(5, Math.floor(all.length * 0.02))
        if (failures.length > tolerance) {
            console.error(`\n${failures.length} failures exceeds tolerance (${tolerance}); failing the run.`)
            process.exit(1)
        }
        console.error(`\n${failures.length} failures is within tolerance (${tolerance}); treating the seed as successful.`)
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
