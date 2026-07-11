import {
    AgentBlockProps,
    AgentToolType,
    FlowActionType,
    flowStructureUtil,
    FlowVersion,
    mcpToolNameUtils,
} from '@intelblocks/shared'
import { Migration } from '.'

const FLOW_ID_LENGTH = 21

/** Derives flow display name from legacy toolName format: "Display Name_<flowId>". */
function deriveFlowDisplayName(legacyToolName: string): string | undefined {
    const suffix = new RegExp(`_[a-zA-Z0-9]{${FLOW_ID_LENGTH}}$`)
    const match = legacyToolName.match(suffix)
    if (!match) return undefined
    const displayName = legacyToolName.slice(0, -match[0].length)
    return displayName.length > 0 ? displayName : undefined
}

type AgentToolInput = {
    type: string
    toolName: string
    blockMetadata?: { blockName: string, blockVersion: string, actionName: string, [key: string]: unknown }
    flowId?: string
    externalFlowId?: string
    flowDisplayName?: string
    [key: string]: unknown
}

export const migrateV16AgentBlockToolNames: Migration = {
    targetSchemaVersion: '16',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if (step.type !== FlowActionType.BLOCK || step.settings.blockName !== '@intelblocks/block-ai' || step.settings.actionName !== 'run_agent') {
                return step
            }

            const tools = (step.settings.input?.[AgentBlockProps.AGENT_TOOLS] as AgentToolInput[] | undefined) ?? []

            const newTools = tools.map((tool) => {
                if (tool.type === AgentToolType.BLOCK && tool.blockMetadata?.blockName != null && tool.blockMetadata?.actionName != null) {
                    return {
                        ...tool,
                        toolName: mcpToolNameUtils.createBlockToolName(tool.blockMetadata.blockName, tool.blockMetadata.actionName),
                    }
                }
                if (tool.type === AgentToolType.FLOW && tool.toolName != null) {
                    const flowDisplayName = tool.flowDisplayName ?? deriveFlowDisplayName(tool.toolName) ?? tool.toolName
                    return {
                        ...tool,
                        toolName: mcpToolNameUtils.createToolName(tool.toolName),
                        flowDisplayName,
                    }
                }
                if (tool.type === AgentToolType.MCP && tool.toolName != null) {
                    return { ...tool, toolName: mcpToolNameUtils.createToolName(tool.toolName) }
                }
                return tool
            })

            return {
                ...step,
                settings: {
                    ...step.settings,
                    input: {
                        ...step.settings.input,
                        [AgentBlockProps.AGENT_TOOLS]: newTools,
                    },
                },
            }
        })

        return {
            ...newVersion,
            schemaVersion: '17',
        }
    },
}
