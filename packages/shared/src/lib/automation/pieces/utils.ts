import { assertNotNullOrUndefined } from '../../core/common'
import { ErrorCode, IntellisperError } from '../../core/common/intellisper-error'

/**
 * @param {string} pieceName - starts with `@intelblocks/block-`
 * @param {string} pieceVersion - the version of the piece
 * @returns {string} the package alias for the piece, e.g. `@intelblocks/block-activepieces-0.0.1`
 */
export const getPackageAliasForBlock = (params: GetPackageAliasForBlockParams): string => {
    const { blockName, blockVersion } = params
    return `${blockName}-${blockVersion}`
}

/**
 * @param {string} alias - e.g. piece-activepieces or @publisher/piece-activepieces or activepieces or @publisher/activepieces 
 * @returns {string} the block name, e.g. intellisper
 */
export const getBlockNameFromAlias = (alias: string): string => {
    const fullBlockName =  alias.startsWith('@') ? alias.split('/').pop() : alias
    assertNotNullOrUndefined(fullBlockName, 'Full piece name')
    if (fullBlockName.startsWith('block-')) {
        return fullBlockName.split('-').slice(1).join('-')
    }
    return fullBlockName
}

/**
 * @param {string} alias - e.g. `@intelblocks/block-activepieces-0.0.1`
 * @returns {string} the piece name, e.g. `@intelblocks/block-activepieces`
 */
export const trimVersionFromAlias = (alias: string): string => {
    return alias.split('-').slice(0, -1).join('-')
}



export const extractBlockFromModule = <T>(params: ExtractBlockFromModuleParams): T => {
    const { module, blockName, blockVersion } = params
    const exports = Object.values(module)
    const constructors = []
    for (const e of exports) {
        if (e !== null && e !== undefined && e.constructor.name === 'Block') {
            return e as T
        }
        constructors.push(e?.constructor?.name)
    }

    throw new IntellisperError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        params: {
            entityType: 'piece',
            entityId: blockName,
            message: `Failed to extract piece from module (version: ${blockVersion}), found constructors: ${constructors.join(', ')}`,
            extra: { blockName, blockVersion },
        },
    })
}

export { getBlockMajorAndMinorVersion } from './version-utils'

type GetPackageAliasForBlockParams = {
    blockName: string
    blockVersion: string
}

type ExtractBlockFromModuleParams = {
    module: Record<string, unknown>
    blockName: string
    blockVersion: string
}
export const MAX_KEY_LENGTH_FOR_CORWDIN = 512
