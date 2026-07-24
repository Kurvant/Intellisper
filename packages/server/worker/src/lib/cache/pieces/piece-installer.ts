import { rm, writeFile } from 'node:fs/promises'
import path, { dirname, join } from 'node:path'
import { fileSystemUtils, memoryLock } from '@intelblocks/server-utils'
import {
    ExecutionMode,
    getBlockNameFromAlias,
    groupBy,
    isEmpty,
    isNil,
    PackageType,
    BlockPackage,
    BlockType,
    PrivateBlockPackage,
    tryCatch,
    WorkerToApiContract,
} from '@intelblocks/shared'
import { trace } from '@opentelemetry/api'
import { Logger } from 'pino'
import writeFileAtomic from 'write-file-atomic'
import { workerSettings } from '../../config/worker-settings'
import { getGlobalCacheCommonPath, getGlobalCachePathLatestVersion } from '../cache-paths'
import { bunRunner } from '../code/bun-runner'

const tracer = trace.getTracer('piece-installer')

const usedBlocksMemoryCache: Record<string, boolean> = {}
// Always POSIX-separated: this value is handed to bun as a `--filter` glob, and
// sanitizeFilterPath() rejects backslashes, which path.join emits on Windows.
// The one call site that turns it back into a filesystem path uses path.resolve,
// which normalises forward slashes on every platform, so it is unaffected.
const relativeBlockPath = (block: BlockPackage) => path.posix.join('./', 'pieces', `${block.blockName}-${block.blockVersion}`)
const blockPath = (rootWorkspace: string, block: BlockPackage) => join(rootWorkspace, 'pieces', `${block.blockName}-${block.blockVersion}`)

export const blockInstaller = (log: Logger, apiClient: WorkerToApiContract) => ({
    async install({ blocks, includeFilters }: InstallParams): Promise<void> {
        const groupedBlocks = groupBlocksByPackagePath(blocks)
        const installPromises = Object.entries(groupedBlocks).map(async ([packagePath, blocksInGroup]) => {
            await installBlocks(packagePath, blocksInGroup, includeFilters, log, apiClient)
        })
        await Promise.all(installPromises)
    },

    getCustomBlocksPath,
})

function getCustomBlocksPath(platformId: string): string {
    switch (workerSettings.getSettings().EXECUTION_MODE) {
        case ExecutionMode.SANDBOX_PROCESS:
        case ExecutionMode.SANDBOX_CODE_AND_PROCESS:
            return path.resolve(getGlobalCachePathLatestVersion(), 'custom_blocks', platformId)
        case ExecutionMode.UNSANDBOXED:
        case ExecutionMode.SANDBOX_CODE_ONLY:
            return getGlobalCacheCommonPath()
        default:
            throw new Error('Invalid execution mode')
    }
}

async function installBlocks(rootWorkspace: string, blocks: BlockPackage[], includeFilters: boolean, log: Logger, apiClient: WorkerToApiContract): Promise<void> {
    const devBlocks = workerSettings.getSettings().DEV_BLOCKS
    const nonDevBlocks = blocks.filter(block => !devBlocks.includes(getBlockNameFromAlias(block.blockName)))
    const { blocksToInstall } = await partitionBlocksToInstall(rootWorkspace, nonDevBlocks)

    if (isEmpty(blocksToInstall)) {
        log.debug({ rootWorkspace }, '[pieceInstaller] No new pieces to install (already installed)')
        return
    }
    log.info({
        rootWorkspace,
        blocksToInstall: blocksToInstall.map(block => `${block.blockName}-${block.blockVersion}`),
    }, '[pieceInstaller] Installing pieces in workspace')

    await memoryLock.runExclusive({
        key: `install-pieces-${rootWorkspace}`,
        fn: async () => {
            const { blocksToInstall } = await partitionBlocksToInstall(rootWorkspace, blocks)
            if (isEmpty(blocksToInstall)) {
                log.info({ rootWorkspace }, '[pieceInstaller] No new pieces to install in lock (already installed)')
                return
            }
            log.info({
                rootWorkspace,
                blocks: blocksToInstall.map(block => `${block.blockName}-${block.blockVersion}`),
            }, '[pieceInstaller] acquired lock and starting to install pieces')

            await createRootPackageJson({
                path: rootWorkspace,
            })

            await savePackageArchivesToDiskIfNotCached(rootWorkspace, blocksToInstall, apiClient)

            await Promise.all(blocksToInstall.map(block => createBlockPackageJson({
                rootWorkspace,
                blockPackage: block,
            })))

            await tracer.startActiveSpan('pieceInstaller.bunInstall', async (span) => {
                try {
                    span.setAttribute('pieces.count', blocksToInstall.length)
                    span.setAttribute('pieces.rootWorkspace', rootWorkspace)

                    const { error: batchError } = await tryCatch(async () => bunRunner(log).install({
                        path: rootWorkspace,
                        filtersPath: includeFilters ? blocksToInstall.map(relativeBlockPath) : [],
                    }))

                    if (isNil(batchError)) {
                        await markBlocksAsUsed(rootWorkspace, blocksToInstall)
                        log.info({
                            rootWorkspace,
                            blocksCount: blocksToInstall.length,
                        }, '[pieceInstaller] Installed registry pieces using bun')
                        return
                    }

                    span.recordException(batchError instanceof Error ? batchError : new Error(String(batchError)))

                    if (blocksToInstall.length === 1) {
                        log.error({ rootWorkspace, error: batchError }, '[pieceInstaller] Block installation failed, rolling back')
                        await rollbackInstallation(rootWorkspace, blocksToInstall)
                        throw batchError
                    }

                    log.warn({
                        rootWorkspace,
                        blocks: blocksToInstall.map(block => `${block.blockName}-${block.blockVersion}`),
                        error: batchError,
                    }, '[pieceInstaller] Batch install failed, retrying pieces individually')

                    const failedBlocks = await tryInstallBlocksIndividually(rootWorkspace, blocksToInstall, log)

                    if (failedBlocks.length > 0) {
                        const names = failedBlocks.map(p => `${p.blockName}@${p.blockVersion}`).join(', ')
                        throw new Error(`[pieceInstaller] Failed to install: ${names}`)
                    }

                    log.info({
                        rootWorkspace,
                        blocksCount: blocksToInstall.length,
                    }, '[pieceInstaller] Installed registry pieces using bun (individual fallback)')
                }
                finally {
                    span.end()
                }
            })
        },
    })
}

async function rollbackInstallation(rootWorkspace: string, blocks: BlockPackage[]): Promise<void> {
    await Promise.all(blocks.map(block => rm(path.resolve(rootWorkspace, relativeBlockPath(block)), {
        recursive: true,
        force: true,
    })))
}

async function tryInstallBlocksIndividually(
    rootWorkspace: string,
    blocks: BlockPackage[],
    log: Logger,
): Promise<BlockPackage[]> {
    const failures: BlockPackage[] = []
    for (const block of blocks) {
        const { error } = await tryCatch(async () =>
            bunRunner(log).install({
                path: rootWorkspace,
                filtersPath: [relativeBlockPath(block)],
            }),
        )
        if (error) {
            log.error({
                block: `${block.blockName}@${block.blockVersion}`,
                error,
            }, '[pieceInstaller] Individual piece installation failed, rolling back')
            await rollbackInstallation(rootWorkspace, [block])
            failures.push(block)
        }
        else {
            await markBlocksAsUsed(rootWorkspace, [block])
        }
    }
    return failures
}

function groupBlocksByPackagePath(blocks: BlockPackage[]): Record<string, BlockPackage[]> {
    return groupBy(blocks, (block) => {
        switch (block.packageType) {
            case PackageType.ARCHIVE:
                return getCustomBlocksPath(block.platformId)
            case PackageType.REGISTRY: {
                if (block.blockType === BlockType.CUSTOM && !isNil(block.platformId)) {
                    return getCustomBlocksPath(block.platformId)
                }
                return getGlobalCacheCommonPath()
            }
            default:
                throw new Error('Invalid package type')
        }
    })
}

async function savePackageArchivesToDiskIfNotCached(
    rootWorkspace: string,
    blocks: BlockPackage[],
    apiClient: WorkerToApiContract,
): Promise<void> {
    const saveToDiskJobs = blocks.map(async (block) => {
        if (block.packageType !== PackageType.ARCHIVE) {
            return
        }
        const archivePath = getPackageArchivePathForBlock(rootWorkspace, block)
        if (await fileSystemUtils.fileExists(archivePath)) {
            return
        }
        await fileSystemUtils.threadSafeMkdir(dirname(archivePath))
        const archive = await apiClient.getBlockArchive({ archiveId: block.archiveId })
        await writeFile(archivePath, archive)
    })
    await Promise.all(saveToDiskJobs)
}

async function createRootPackageJson({ path }: { path: string }): Promise<void> {
    const packageJsonPath = join(path, 'package.json')
    await fileSystemUtils.threadSafeMkdir(dirname(packageJsonPath))
    await writeFileAtomic(packageJsonPath, JSON.stringify({
        'name': 'fast-workspace',
        'version': '1.0.0',
        'workspaces': [
            'pieces/**',
        ],
    }, null, 2), 'utf8')
    await createInstallNpmrc({ path })
}

// The @intelblocks/* blocks are published to GitHub Packages, not the public npm registry. bun
// install runs in this isolated workspace directory (cwd), which does NOT inherit the repo-root
// .npmrc, so without a local .npmrc bun resolves against registry.npmjs.org and 404s on every
// @intelblocks/block-* package -- which surfaces to the user as a generic "Unexpected error" the
// moment a managed block runs. Write a scoped .npmrc here so the scope resolves to GitHub Packages
// with the runtime token. The token is written resolved (not as ${GITHUB_TOKEN}) because bun does
// not reliably expand env-var references inside .npmrc. If no token is configured (e.g. a
// self-hosted install using only public/local blocks) the registry line is still written so the
// scope resolves, and only the auth line is omitted.
async function createInstallNpmrc({ path }: { path: string }): Promise<void> {
    const token = process.env['GITHUB_TOKEN']
    const lines = [
        '@intelblocks:registry=https://npm.pkg.github.com/',
    ]
    if (token !== undefined && token.trim() !== '') {
        lines.push(`//npm.pkg.github.com/:_authToken=${token}`)
    }
    lines.push('legacy-peer-deps=true')
    await writeFileAtomic(join(path, '.npmrc'), lines.join('\n') + '\n', 'utf8')
}

async function createBlockPackageJson({ rootWorkspace, blockPackage }: {
    rootWorkspace: string
    blockPackage: BlockPackage
}): Promise<void> {
    const packageJsonPath = join(blockPath(rootWorkspace, blockPackage), 'package.json')

    const packageJson = {
        'name': `${blockPackage.blockName}-${blockPackage.blockVersion}`,
        'version': `${blockPackage.blockVersion}`,
        'dependencies': {
            [blockPackage.blockName]: blockPackage.packageType === PackageType.REGISTRY ? blockPackage.blockVersion : getPackageArchivePathForBlock(rootWorkspace, blockPackage),
        },
    }
    await fileSystemUtils.threadSafeMkdir(dirname(packageJsonPath))
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8')
}

async function partitionBlocksToInstall(rootWorkspace: string, blocks: BlockPackage[]): Promise<BlockInstallationResult> {
    const blocksWithCheck = await Promise.all(
        blocks.map(async (block) => {
            const installed = await blockCheckIfAlreadyInstalled(rootWorkspace, block)
            return { block, installed }
        }),
    )

    const blocksToInstall = blocksWithCheck.filter(({ installed }) => !installed).map(({ block }) => block)

    return {
        blocksToInstall,
    }
}

async function blockCheckIfAlreadyInstalled(rootWorkspace: string, block: BlockPackage): Promise<boolean> {
    const blockFolder = blockPath(rootWorkspace, block)
    if (usedBlocksMemoryCache[blockFolder]) {
        return true
    }
    const readyExists = await fileSystemUtils.fileExists(join(blockFolder, 'ready'))
    if (!readyExists) {
        return false
    }
    const nodeModulesExist = await fileSystemUtils.fileExists(join(blockFolder, 'node_modules'))
    if (!nodeModulesExist) {
        await rm(join(blockFolder, 'ready'), { force: true })
        return false
    }
    usedBlocksMemoryCache[blockFolder] = true
    return true
}

async function markBlocksAsUsed(rootWorkspace: string, blocks: BlockPackage[]): Promise<void> {
    const writeToDiskJobs = blocks.map(async (block) => {
        const blockFolder = blockPath(rootWorkspace, block)
        await fileSystemUtils.threadSafeMkdir(blockFolder)
        await writeFileAtomic(
            join(blockFolder, 'ready'),
            'true',
        )
    })
    await Promise.all(writeToDiskJobs)
}

function getPackageArchivePathForBlock(rootWorkspace: string, blockPackage: PrivateBlockPackage): string {
    return join(blockPath(rootWorkspace, blockPackage), `${blockPackage.archiveId}.tgz`)
}

type InstallParams = {
    blocks: BlockPackage[]
    includeFilters: boolean
}

type BlockInstallationResult = {
    blocksToInstall: BlockPackage[]
}
