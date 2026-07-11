import {
    FlowActionType,
    flowStructureUtil,
    FlowVersion,
} from '@intelblocks/shared'
import { Migration } from '.'


export const migrateV10AiBlocksProviderId: Migration = {
    targetSchemaVersion: '10',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if (step.type !== FlowActionType.BLOCK) {
                return step
            }
            if (step.settings.blockName !== '@intelblocks/block-ai' || !['0.0.1', '0.0.2'].includes(step.settings.blockVersion)) {
                return step
            }

            const input = step.settings?.input as Record<string, unknown>

            return {
                ...step,
                settings: {
                    ...step.settings,
                    blockName: '@intelblocks/block-ai',
                    blockVersion: '0.0.4',
                    input,
                },
            }
        })

        return {
            ...newVersion,
            schemaVersion: '11',
        }
    },
}


