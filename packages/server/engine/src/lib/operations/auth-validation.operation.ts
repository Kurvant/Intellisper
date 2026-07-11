import {
    EngineResponse,
    EngineResponseStatus,
    ExecuteValidateAuthOperation,
    ExecuteValidateAuthResponse,
} from '@intelblocks/shared'
import { EngineConstants } from '../handler/context/engine-constants'
import { pieceHelper } from '../helper/piece-helper'

export const authValidationOperation = {
    execute: async (operation: ExecuteValidateAuthOperation): Promise<EngineResponse<ExecuteValidateAuthResponse>> => {
        const input = operation as ExecuteValidateAuthOperation
        const output = await pieceHelper.executeValidateAuth({
            params: input,
            devBlocks: EngineConstants.DEV_BLOCKS,
        })

        return {
            status: EngineResponseStatus.OK,
            response: output,
        }
    },
}