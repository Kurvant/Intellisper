import { ExecutePropsResult, PropertyType } from '@intelblocks/blocks-framework'
import {
    EngineResponse,
    EngineResponseStatus,
    ExecutePropsOptions,
} from '@intelblocks/shared'
import { pieceHelper } from '../helper/piece-helper'


export const propertyOperation = {
    execute: async (operation: ExecutePropsOptions): Promise<EngineResponse<ExecutePropsResult<PropertyType.DROPDOWN | PropertyType.MULTI_SELECT_DROPDOWN | PropertyType.DYNAMIC>>> => {
        const output = await pieceHelper.executeProps({
            ...operation,
            blockName: operation.block.blockName,
            blockVersion: operation.block.blockVersion,
        })
        return {
            status: EngineResponseStatus.OK,
            response: output,
        }
    },
}