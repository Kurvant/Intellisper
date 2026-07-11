import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cwd } from 'node:process'
import { sep } from 'path'
import { Block, BlockMetadata, blockTranslation } from '@intelblocks/blocks-framework'
import { extractBlockFromModule } from '@intelblocks/shared'
import clearModule from 'clear-module'
import { FastifyBaseLogger } from 'fastify'
import { AppSystemProp, environmentVariables } from '../../../helper/system/system-props'

const SOURCE_BLOCKS_PATH = resolve(cwd(), 'packages', 'blocks')

export const fileBlocksUtils = (log: FastifyBaseLogger) => ({

    getPackageNameFromFolderPath: async (folderPath: string): Promise<string> => {
        const packageJson = await readFile(join(folderPath, 'package.json'), 'utf-8').then(JSON.parse)
        return packageJson.name
    },

    getBlockDependencies: async (folderPath: string): Promise<Record<string, string> | null> => {
        try {
            const packageJson =  await readFile(join(folderPath, 'package.json'), 'utf-8').then(JSON.parse)
            if (!packageJson.dependencies) {
                return null
            }
            return packageJson.dependencies
        }
        catch (e) {
            return null
        }
    },

    findDistBlockPathByPackageName: async (packageName: string): Promise<string | null> => {
        const paths = await findAllDistBlocksFolders(SOURCE_BLOCKS_PATH)
        for (const path of paths) {
            try {
                const packageJsonName = await fileBlocksUtils(log).getPackageNameFromFolderPath(path)
                if (packageJsonName === packageName) {
                    return path
                }
            }
            catch (e) {
                log.error({
                    name: 'findDistPiecePathByPackageName',
                    message: JSON.stringify(e),
                }, 'Error finding dist piece path by package name')
            }
        }
        return null
    },

    findSourceBlockPathByBlockName: async (blockName: string): Promise<string | null> => {
        const blocksPath = await findAllBlocksFolder(SOURCE_BLOCKS_PATH)
        const blockPath = blocksPath.find((p) => p.endsWith(sep + blockName))
        return blockPath ?? null
    },

    loadDistBlocksMetadata: async (blocksNames: string[]): Promise<BlockMetadata[]> => {
        try {
            const devBlocks = await findAllDistBlocksFolders(SOURCE_BLOCKS_PATH)
            const paths = devBlocks.filter(path => blocksNames.some(name => path.endsWith(sep + name + sep + 'dist')))
            const blocks = await Promise.all(paths.map((p) => loadBlockFromFolder(p)))
            return blocks.filter((p): p is BlockMetadata => p !== null)
        }
        catch (e) {
            const err = e as Error
            log.warn({ err }, '[filePieceMetadataService#loadDistPiecesMetadata] Failed to load pieces from folder')
            return []
        }
    },

    /**
     * Loads the metadata of every locally built block.
     *
     * Only ever called from the offline seeding script, never from the request path:
     * it `require()`s each block's module, and the API process must stay free of
     * block code. A block that fails to load is skipped rather than aborting the
     * whole scan, so one broken package cannot block seeding the other 700+.
     */
    loadAllDistBlocksMetadata: async (): Promise<BlockMetadata[]> => {
        const paths = await findAllDistBlocksFolders(SOURCE_BLOCKS_PATH)
        const blocks = await Promise.all(paths.map(async (path) => {
            try {
                return await loadBlockFromFolder(path)
            }
            catch (e) {
                const err = e as Error
                log.warn({ err, path }, '[fileBlocksUtils#loadAllDistBlocksMetadata] Skipping block that failed to load')
                return null
            }
        }))
        return blocks.filter((p): p is BlockMetadata => p !== null)
    },


    clearBlockModuleCache: (distFolderPath: string): void => {
        const indexPath = join(distFolderPath, 'src', 'index')
        const packageJsonPath = join(distFolderPath, 'package.json')
        clearModule(indexPath)
        clearModule(packageJsonPath)
    },
})

const findAllBlocksFolder = async (folderPath: string): Promise<string[]> => {
    const paths = []
    const files = await readdir(folderPath)

    const ignoredFiles = ['node_modules', 'dist', 'framework', 'common']
    for (const file of files) {
        const filePath = join(folderPath, file)
        const fileStats = await stat(filePath)
        if (
            fileStats.isDirectory() &&
            !ignoredFiles.includes(file)
        ) {
            paths.push(...(await findAllBlocksFolder(filePath)))
        }
        else if (file === 'package.json') {
            paths.push(folderPath)
        }
    }
    return paths
}

const findAllDistBlocksFolders = async (sourceBlocksPath: string): Promise<string[]> => {
    const sourceFolders = await findAllBlocksFolder(sourceBlocksPath)
    const distFolders = []
    for (const folder of sourceFolders) {
        const distPath = join(folder, 'dist')
        try {
            const distStats = await stat(distPath)
            if (distStats.isDirectory()) {
                distFolders.push(distPath)
            }
        }
        catch {
            // dist folder doesn't exist for this block, skip
        }
    }
    return distFolders
}

const loadBlockFromFolder = async (
    folderPath: string,
): Promise<BlockMetadata | null> => {
    const indexPath = join(folderPath, 'src', 'index')
    const packageJsonPath = join(folderPath, 'package.json')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const packageJson = require(packageJsonPath)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require(indexPath)
    const { name: blockName, version: blockVersion } = packageJson
    const block = extractBlockFromModule<Block>({
        module,
        blockName,
        blockVersion,
    })
    const originalMetadata = block.metadata()
    const loadTranslations = environmentVariables.getBooleanEnvironment(AppSystemProp.LOAD_TRANSLATIONS_FOR_DEV_BLOCKS)
    const i18n = loadTranslations ? await blockTranslation.initializeI18n(folderPath) : undefined
    const metadata: BlockMetadata = {
        ...originalMetadata,
        name: blockName,
        version: blockVersion,
        authors: block.authors,
        directoryPath: folderPath,
        i18n,
    }

    return metadata
}