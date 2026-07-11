import {
    AgentBlockProps,
    FlowActionType,
    flowStructureUtil,
    FlowVersion,
} from '@intelblocks/shared'
import { Migration } from '.'

export const migrateV14AgentProviderModel: Migration = {
    targetSchemaVersion: '14',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if (step.type === FlowActionType.BLOCK && step.settings.blockName === '@intelblocks/block-ai') {
                const actionName = step.settings.actionName
                const input = step.settings?.input as Record<string, unknown>

                if (actionName === 'run_agent') {
                    const provider = input['provider'] as string
                    const model = input['model'] as string
                    
                    return {
                        ...step,
                        settings: {
                            ...step.settings,
                            input: {
                                ...input,
                                [AgentBlockProps.AI_PROVIDER_MODEL]: { provider, model },
                            },
                        },
                    }
                }
                return step
            }
            return step
        })

        return {
            ...newVersion,
            schemaVersion: '15',
        }
    },
}