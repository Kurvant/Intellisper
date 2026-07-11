import { spawn } from 'node:child_process'
import { copyFile, cp } from 'node:fs/promises'
import { join } from 'path'
import { memoryLock } from '@intelblocks/server-utils'
import { isNil, WebsocketClientEvent } from '@intelblocks/shared'
import chokidar from 'chokidar'
import { FastifyInstance } from 'fastify'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { fileBlocksUtils } from './metadata/utils/file-pieces-utils'
import { invalidateDevBlockCache } from './metadata/utils/piece-cache-utils'

const PIECES_BUILDER_MUTEX_KEY = 'pieces-builder'

async function buildBlocks(app: FastifyInstance, blocksInfo: BlockInfo[]): Promise<void> {
    if (blocksInfo.length === 0) return

    for (const block of blocksInfo) {
        if (!/^[A-Za-z0-9-]+$/.test(block.blockName)) {
            throw new Error(`Block package name contains invalid character: ${block.blockName}`)
        }
    }

    const blockFilters = blocksInfo.map(p => `--filter=${p.packageName}`)
    const filterArgs = [
        '--filter=@intelblocks/blocks-framework',
        '--filter=@intelblocks/blocks-common',
        '--filter=@intelblocks/shared',
        ...blockFilters,
        '--force',
    ]
    app.log.info(`Building ${blocksInfo.length} piece(s): ${blocksInfo.map(p => p.blockName).join(',')}...`)

    const lock = await memoryLock.acquire(PIECES_BUILDER_MUTEX_KEY)
    try {
        const startTime = performance.now()
        await spawnAndWait('npx', ['turbo', 'run', 'build', ...filterArgs])
        const buildTime = (performance.now() - startTime) / 1000

        app.log.info(`Build completed in ${buildTime.toFixed(2)} seconds`)

        const utils = fileBlocksUtils(app.log)
        await Promise.all(blocksInfo.map(async (block) => {
            await copyPackageJsonToDist(block.blockDirectory)
            await copyI18nToDist(block.blockDirectory)
            const distPath = await utils.findDistBlockPathByPackageName(block.packageName)
            if (distPath) {
                utils.clearBlockModuleCache(distPath)
            }
        }))

        invalidateDevBlockCache()
        app.io.emit(WebsocketClientEvent.REFRESH_BLOCK)
        app.log.info('Changes are ready! Please refresh the frontend to see the new updates.')
    }
    catch (error) {
        app.log.error({ err: error }, 'Failed to run build process...')
    }
    finally {
        await lock.release()
    }
}

export async function startDevBlockWatcher(app: FastifyInstance): Promise<void> {
    const devBlocksConfig = system.get(AppSystemProp.DEV_BLOCKS)
    if (isNil(devBlocksConfig) || devBlocksConfig.trim() === '') return

    const blocksNames = [...new Set(devBlocksConfig.split(',').map(n => n.trim()))]
    const utils = fileBlocksUtils(app.log)

    const resolvedInfos = await Promise.all(blocksNames.map(async (blockName) => {
        const blockDirectory = await utils.findSourceBlockPathByBlockName(blockName)
        if (isNil(blockDirectory)) {
            app.log.warn(`Block directory not found for: ${blockName}`)
            return null
        }
        const packageName = await utils.getPackageNameFromFolderPath(blockDirectory)
        return { blockName, blockDirectory, packageName }
    }))
    const blockInfos: BlockInfo[] = resolvedInfos.filter((info): info is BlockInfo => info !== null)

    if (blockInfos.length === 0) return

    const rebuilding = new Set<string>()
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const pendingRebuild = new Set<string>()

    const watchPaths = blockInfos.flatMap(p => [
        join(p.blockDirectory, 'src'),
        join(p.blockDirectory, 'package.json'),
    ])

    const triggerBuild = async (blockInfo: BlockInfo) => {
        rebuilding.add(blockInfo.blockName)
        try {
            await buildBlocks(app, [blockInfo])
        }
        finally {
            rebuilding.delete(blockInfo.blockName)
        }
        if (pendingRebuild.has(blockInfo.blockName)) {
            pendingRebuild.delete(blockInfo.blockName)
            void triggerBuild(blockInfo)
        }
    }

    const watcher = chokidar.watch(watchPaths, { ignoreInitial: true })

    watcher.on('all', (_event, filePath) => {
        const blockInfo = blockInfos.find(p => filePath.startsWith(p.blockDirectory))
        if (!blockInfo) return

        clearTimeout(debounceTimers.get(blockInfo.blockName))
        debounceTimers.set(blockInfo.blockName, setTimeout(() => {
            debounceTimers.delete(blockInfo.blockName)
            if (rebuilding.has(blockInfo.blockName)) {
                pendingRebuild.add(blockInfo.blockName)
                return
            }
            void triggerBuild(blockInfo)
        }, 300))
    })

    watcher.on('error', (error) => {
        app.log.error({ err: error }, 'File watcher error')
    })

    for (const blockInfo of blockInfos) {
        app.log.info(`Watching for changes: ${blockInfo.blockName}`)
    }

    const cleanup = async () => {
        await watcher.close()
        for (const timer of debounceTimers.values()) {
            clearTimeout(timer)
        }
    }
    process.once('SIGINT', () => void cleanup())
    process.once('SIGTERM', () => void cleanup())
}

function spawnAndWait(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: false,
        })
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
            }
            else {
                reject(new Error(`Command "${cmd}" exited with code ${code}`))
            }
        })
        child.on('error', reject)
    })
}

async function copyPackageJsonToDist(sourceDir: string): Promise<void> {
    const distDir = join(sourceDir, 'dist')
    await copyFile(join(sourceDir, 'package.json'), join(distDir, 'package.json'))
}

async function copyI18nToDist(sourceDir: string): Promise<void> {
    const i18nSrc = join(sourceDir, 'src', 'i18n')
    const distDir = join(sourceDir, 'dist')
    try {
        await cp(i18nSrc, join(distDir, 'src', 'i18n'), { recursive: true })
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

type BlockInfo = {
    packageName: string
    blockName: string
    blockDirectory: string
}
