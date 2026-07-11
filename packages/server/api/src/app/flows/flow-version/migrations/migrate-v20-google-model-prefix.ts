import {
    AgentBlockProps,
    FlowActionType,
    flowStructureUtil,
    FlowVersion,
    isNil,
} from '@intelblocks/shared'
import { Migration } from '.'

export const migrateV20GoogleModelPrefix: Migration = {
    targetSchemaVersion: '20',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if (step.type !== FlowActionType.BLOCK || step.settings.blockName !== '@intelblocks/block-ai') {
                return step
            }

            const input = step.settings.input as Record<string, unknown>

            if (step.settings.actionName === 'askAi') {
                return {
                    ...step,
                    settings: {
                        ...step.settings,
                        input: {
                            ...input,
                            model: stripGooglePrefix(input.model),
                        },
                    },
                }
            }

            if (step.settings.actionName === 'run_agent') {
                const aiProviderModel = input[AgentBlockProps.AI_PROVIDER_MODEL] as Record<string, unknown> | undefined
                if (isNil(aiProviderModel)) {
                    return step
                }
                return {
                    ...step,
                    settings: {
                        ...step.settings,
                        input: {
                            ...input,
                            [AgentBlockProps.AI_PROVIDER_MODEL]: {
                                ...aiProviderModel,
                                model: stripGooglePrefix(aiProviderModel.model),
                            },
                        },
                    },
                }
            }

            return step
        })

        return {
            ...newVersion,
            schemaVersion: '21',
        }
    },
}

const GOOGLE_MODEL_PREFIX = 'models/'

function stripGooglePrefix(modelId: unknown): unknown {
    if (typeof modelId !== 'string' || !modelId.startsWith(GOOGLE_MODEL_PREFIX)) {
        return modelId
    }
    return modelId.slice(GOOGLE_MODEL_PREFIX.length)
}
