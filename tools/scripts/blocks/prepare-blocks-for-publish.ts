import { findAllPiecesDirectoryInSource } from '../utils/block-script-utils'
import { preparePieceDistForPublish } from '../../../packages/cli/src/lib/utils/prepare-piece-utils'

function getChangedPiecePaths(): string[] | null {
    const changedPieces = process.env['CHANGED_PIECES']
    if (!changedPieces || changedPieces.trim() === '') {
        return null
    }
    return changedPieces.split('\n').filter(Boolean)
}

async function main(): Promise<void> {
    const changedPaths = getChangedPiecePaths()
    const blockPaths = changedPaths ?? await findAllPiecesDirectoryInSource()

    console.info(`[preparePieces] processing ${blockPaths.length} pieces${changedPaths ? ' (scoped to changed)' : ' (all)'}`)

    for (const blockPath of blockPaths) {
        preparePieceDistForPublish(blockPath)
    }

    console.info(`[preparePieces] done, prepared ${blockPaths.length} pieces`)
}

main()
