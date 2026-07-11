import {
    AgentBlockProps,
    FlowActionType,
    flowStructureUtil,
    FlowVersion,
    isNil,
} from '@intelblocks/shared'
import { Migration } from '.'

export const cleanUpAgentTools: Migration = {
    targetSchemaVersion: '8',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if (step.type === FlowActionType.BLOCK && step.settings.blockName === '@intelblocks/block-agent') {
                const tools = (step.settings.input['agentTools'] as { type: string, toolName: string, blockMetadata: { blockName: string, blockVersion: string, actionName: string, connectionExternalId: string }, flowId: string }[]) ?? []
                const newTools = tools.map(tool => {
                    switch (tool.type) {
                        case 'BLOCK': {
                            return {
                                type: tool.type,
                                toolName: tool.toolName,
                                blockMetadata: {
                                    blockName: tool.blockMetadata.blockName,
                                    blockVersion: tool.blockMetadata.blockVersion,
                                    actionName: tool.blockMetadata.actionName,
                                    predefinedInput: {
                                        auth: !isNil(tool.blockMetadata.connectionExternalId) ? `{{connections['${tool.blockMetadata.connectionExternalId}']}}` : undefined,
                                    },
                                },
                            }
                        }
                        case 'FLOW': {
                            return {
                                type: tool.type,
                                toolName: tool.toolName,
                                flowId: tool.flowId,
                            }
                        }
                        default: {
                            throw new Error(`Unknown tool type: ${tool.type}`)
                        }
                    }
                })

                step.settings = {
                    ...step.settings,
                    blockVersion: '0.3.7',
                    input: {
                        ...step.settings.input,
                        [AgentBlockProps.AGENT_TOOLS]: newTools,
                    },
                }
            }
            return step
        })

        return {
            ...newVersion,
            schemaVersion: '9',
        }
    },
}