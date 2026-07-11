import fs from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { Action, Block, BlockPropertyMap, Trigger } from '@intelblocks/blocks-framework'
import { IntellisperError, EngineGenericError, ErrorCode, extractBlockFromModule, getPackageAliasForBlock, getBlockNameFromAlias, isNil, trimVersionFromAlias } from '@intelblocks/shared'
import { utils } from '../utils'

export const pieceLoader = {
    loadPieceOrThrow: async (
        { blockName, blockVersion, devBlocks }: LoadPieceParams,
    ): Promise<Block> => {
        const { data: piece, error: pieceError } = await utils.tryCatchAndThrowOnEngineError(async () => {
            const packageName = pieceLoader.getPackageAlias({
                blockName,
                blockVersion,
                devBlocks,
            })
            const piecePath = await pieceLoader.getPiecePath({ packageName, devBlocks })
            // getPiecePath returns a filesystem path. Node's ESM loader only accepts
            // file:/data:/node: URLs, so an absolute Windows path ("C:\...") is rejected
            // as an unsupported "c:" protocol. pathToFileURL yields the right URL on
            // every platform.
            const module = await import(pathToFileURL(piecePath).href)

            const piece = extractBlockFromModule<Block>({
                module,
                blockName,
                blockVersion,
            })

            if (isNil(piece)) {
                throw new EngineGenericError('BlockNotFoundError', `Block not found: ${blockName}, blockVersion: ${blockVersion}`)
            }
            return piece
        })
        if (pieceError) {
            throw pieceError
        }
        return piece
    },

    getPieceAndTriggerOrThrow: async (params: GetPieceAndTriggerParams): Promise<{ piece: Block, pieceTrigger: Trigger }> => {
        const { blockName, blockVersion, triggerName, devBlocks } = params
        const piece = await pieceLoader.loadPieceOrThrow({ blockName, blockVersion, devBlocks })
        const trigger = piece.getTrigger(triggerName)

        if (trigger === undefined) {
            throw new EngineGenericError('TriggerNotFoundError', `Trigger not found, blockName=${blockName}, triggerName=${triggerName}`)
        }

        return {
            piece,
            pieceTrigger: trigger,
        }
    },

    getPieceAndActionOrThrow: async (params: GetPieceAndActionParams): Promise<{ piece: Block, pieceAction: Action }> => {
        const { blockName, blockVersion, actionName, devBlocks } = params

        const piece = await pieceLoader.loadPieceOrThrow({ blockName, blockVersion, devBlocks })
        const pieceAction = piece.getAction(actionName)

        if (isNil(pieceAction)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'step',
                    entityId: actionName,
                    message: `Action not found for block ${blockName}@${blockVersion}`,
                    extra: { blockName, blockVersion },
                },
            })
        }

        return {
            piece,
            pieceAction,
        }
    },

    getPropOrThrow: async ({ blockName, blockVersion, actionOrTriggerName, propertyName, devBlocks }: GetPropParams) => {
        const piece = await pieceLoader.loadPieceOrThrow({ blockName, blockVersion, devBlocks })

        const actionOrTrigger = piece.getAction(actionOrTriggerName) ?? piece.getTrigger(actionOrTriggerName)

        if (isNil(actionOrTrigger)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'step',
                    entityId: actionOrTriggerName,
                    message: `Step not found for block ${blockName}@${blockVersion}`,
                    extra: { blockName, blockVersion },
                },
            })
        }

        const property = (actionOrTrigger.props as BlockPropertyMap)[propertyName]

        if (isNil(property)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'config',
                    entityId: propertyName,
                    message: `Config not found for step ${actionOrTriggerName} in block ${blockName}@${blockVersion}`,
                    extra: { blockName, blockVersion, stepName: actionOrTriggerName },
                },
            })
        }

        return { property, piece }
    },

    getPackageAlias: ({ blockName, blockVersion, devBlocks }: GetPackageAliasParams) => {
        if (devBlocks.includes(getBlockNameFromAlias(blockName))) {
            return blockName
        }

        return getPackageAliasForBlock({
            blockName,
            blockVersion,
        })
    },

    getPiecePath: async ({ packageName, devBlocks }: GetPiecePathParams): Promise<string> => {
        const piecePath = devBlocks.includes(getBlockNameFromAlias(packageName))
            ? await findInDistFolder(packageName)
            : await traverseAllParentFoldersToFindPiece(packageName)
        if (isNil(piecePath)) {
            throw new EngineGenericError('BlockNotFoundError', `Block not found for package: ${packageName}`)
        }
        return piecePath
    },
}

async function findInDistFolder(packageName: string): Promise<string | null> {
    const sourcePiecesPath = path.resolve('packages/blocks')
    if (!await utils.folderExists(sourcePiecesPath)) {
        return null
    }
    const distPackageJsonPaths = await findDistPackageJsonFiles(sourcePiecesPath)
    for (const packageJsonPath of distPackageJsonPaths) {
        const { data: result } = await utils.tryCatchAndThrowOnEngineError(async () => {
            const content = await fs.readFile(packageJsonPath, 'utf-8')
            const packageJson = JSON.parse(content)
            if (packageJson.name === packageName) {
                return path.join(path.dirname(packageJsonPath), 'src', 'index.js')
            }
            return null
        })
        if (result) {
            return result
        }
    }
    return null
}

async function findDistPackageJsonFiles(dirPath: string): Promise<string[]> {
    const results: string[] = []
    const ignoredDirs = ['node_modules', '.turbo', 'framework', 'common']

    async function scanDir(currentPath: string): Promise<void> {
        const items = await fs.readdir(currentPath, { withFileTypes: true })
        for (const item of items) {
            if (!item.isDirectory() || ignoredDirs.includes(item.name)) {
                continue
            }
            const fullPath = path.join(currentPath, item.name)
            if (item.name === 'dist') {
                const pkgJson = path.join(fullPath, 'package.json')
                if (await utils.folderExists(pkgJson)) {
                    results.push(pkgJson)
                }
            }
            else {
                await scanDir(fullPath)
            }
        }
    }

    await scanDir(dirPath)
    return results
}


async function traverseAllParentFoldersToFindPiece(packageName: string): Promise<string | null> {
    const customPaths = (process.env.IB_CUSTOM_BLOCKS_PATHS ?? '').split(':').filter(Boolean)
    for (const customPath of customPaths) {
        const piecePath = path.resolve(customPath, 'pieces', packageName, 'node_modules', trimVersionFromAlias(packageName))
        if (await utils.folderExists(piecePath)) {
            return path.join(piecePath, 'src', 'index.js')
        }
    }

    const rootDir = path.parse(__dirname).root
    let currentDir = __dirname
    const maxIterations = currentDir.split(path.sep).length
    for (let i = 0; i < maxIterations; i++) {
        const piecePath = path.resolve(currentDir, 'pieces', packageName, 'node_modules', trimVersionFromAlias(packageName))

        if (await utils.folderExists(piecePath)) {
            return path.join(piecePath, 'src', 'index.js')
        }

        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir || currentDir === rootDir) {
            break
        }
        currentDir = parentDir
    }
    return null
}

type GetPiecePathParams = {
    packageName: string
    devBlocks: string[]
}

type LoadPieceParams = {
    blockName: string
    blockVersion: string
    devBlocks: string[]
}

type GetPieceAndTriggerParams = {
    blockName: string
    blockVersion: string
    triggerName: string
    devBlocks: string[]
}

type GetPieceAndActionParams = {
    blockName: string
    blockVersion: string
    actionName: string
    devBlocks: string[]
}

type GetPropParams = {
    blockName: string
    blockVersion: string
    actionOrTriggerName: string
    propertyName: string
    devBlocks: string[]
}

type GetPackageAliasParams = {
    blockName: string
    devBlocks: string[]
    blockVersion: string
}

