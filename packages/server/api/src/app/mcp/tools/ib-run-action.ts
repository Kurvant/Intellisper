import { McpToolDefinition, Permission, ProjectScopedMcpServer } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { executeAdhocAction } from './flow-run-utils'
import { mcpUtils } from './mcp-utils'

const runActionInput = z.object({
    blockName: z.string().describe('Block name, e.g. "slack" or "@intelblocks/block-slack". Use ib_research_blocks to discover.'),
    actionName: z.string().describe('Action to run, e.g. "send_channel_message". Use ib_get_block_props for the input shape.'),
    input: z.record(z.string(), z.unknown()).optional().describe('Fully-resolved input for the action. Keys must match the block action\'s props. Pass raw values — do NOT wrap in {{...}}. Omit if the action has no props.'),
    connectionExternalId: z.string().optional().describe('externalId from ib_list_connections. Required if the block needs auth. Auto-wrapped as {{connections[\'externalId\']}}.'),
})

export const ibRunActionTool = (mcp: ProjectScopedMcpServer, log: FastifyBaseLogger): McpToolDefinition => {
    return {
        title: 'ib_run_action',
        permission: Permission.WRITE_RUN,
        description: 'Execute a single block action once, without building or saving a flow. Use this for one-shot tasks like "check my inbox" or "send one Slack message". For recurring/triggered work, build a flow with ib_build_flow instead.',
        inputSchema: runActionInput.shape,
        annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
        execute: async (args) => {
            try {
                const { blockName, actionName, input, connectionExternalId } = runActionInput.parse(args)
                return await executeAdhocAction({
                    projectId: mcp.projectId,
                    blockName,
                    actionName,
                    input,
                    connectionExternalId,
                    log,
                })
            }
            catch (err) {
                log.error({ err, projectId: mcp.projectId }, 'ib_run_action failed')
                return mcpUtils.mcpToolError('Failed to run action', err)
            }
        },
    }
}
