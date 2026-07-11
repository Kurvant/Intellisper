import { BlockMetadata } from '@intelblocks/blocks-framework'
import {
    EngineResponse,
    EngineResponseStatus,
    ExecuteExtractBlockMetadataOperation,
} from '@intelblocks/shared'
import { EngineConstants } from '../handler/context/engine-constants'
import { pieceHelper } from '../helper/piece-helper'


export const pieceMetadataOperation = {
    extract: async (operation: ExecuteExtractBlockMetadataOperation): Promise<EngineResponse<BlockMetadata>>  => {
        const input = operation as ExecuteExtractBlockMetadataOperation
        const output = await pieceHelper.extractPieceMetadata({
            params: input,
            devBlocks: EngineConstants.DEV_BLOCKS,
        })
        return {
            status: EngineResponseStatus.OK,
            response: output,
        }
    },
}