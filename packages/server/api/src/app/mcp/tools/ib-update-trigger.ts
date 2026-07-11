import {
    FlowOperationRequest,
    FlowOperationType,
    FlowTriggerType,
    isNil,
    McpToolDefinition,
    Permission,
    BlockTrigger,
    ProjectScopedMcpServer,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { flowService } from '../../flows/flow/flow.service'
import { blockMetadataService } from '../../pieces/metadata/piece-metadata-service'
import { projectService } from '../../project/project-service'
import { mcpUtils } from './mcp-utils'

const updateTriggerInput = z.object({
    flowId: z.string(),
    blockName: z.string(),
    triggerName: z.string(),
    input: z.record(z.string(), z.unknown()).optional(),
    auth: z.string().optional(),
    displayName: z.string().optional(),
})

export const ibUpdateTriggerTool = (mcp: ProjectScopedMcpServer, log: FastifyBaseLogger): McpToolDefinition => {
    return {
        title: 'ib_update_trigger',
        permission: Permission.WRITE_FLOW,
        description: 'Set or update the trigger for a flow.',
        inputSchema: {
            flowId: z.string().describe('The id of the flow'),
            blockName: z.string().describe('The block name for the trigger (e.g. "@intelblocks/block-gmail"). Use ib_research_blocks to get valid values.'),
            triggerName: z.string().describe('The trigger name within the block (e.g. "new_email"). Use ib_research_blocks with includeTriggers=true to get valid values.'),
            input: z.record(z.string(), z.unknown()).optional().describe(`Input settings for the trigger (key-value pairs). ${mcpUtils.STEP_REFERENCE_HINT}`),
            auth: z.string().optional().describe('Connection `externalId` from `ib_list_connections`. The tool wraps it automatically as `{{connections[\'externalId\']}}`.'),
            displayName: z.string().optional().describe('Display name for the trigger step'),
        },
        annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: async (args) => {
            const { flowId, blockName, triggerName, input: rawInput, auth, displayName: rawDisplayName } = updateTriggerInput.parse(args)

            const authError = mcpUtils.validateAuth(auth)
            if (authError) {
                return authError
            }

            const displayName = rawDisplayName ?? triggerName

            const [flow, project] = await Promise.all([
                flowService(log).getOnePopulated({ id: flowId, projectId: mcp.projectId }),
                projectService(log).getOneOrThrow(mcp.projectId),
            ])
            if (isNil(flow)) {
                return { content: [{ type: 'text', text: '❌ Flow not found' }] }
            }

            const versionResult = await mcpUtils.resolveLatestBlockVersion({ blockName, projectId: mcp.projectId, platformId: project.platformId, log })
            if (versionResult.error) {
                return versionResult.error
            }
            const blockVersion = versionResult.blockVersion
            const resolvedBlockName = versionResult.normalizedBlockName

            const existingTrigger = flow.version.trigger
            const existingBlockSettings = existingTrigger.type === FlowTriggerType.BLOCK
                && existingTrigger.settings.blockName === resolvedBlockName
                && existingTrigger.settings.triggerName === triggerName
                ? existingTrigger.settings
                : null

            const { auth: _rawAuth, ...rawInputWithoutAuth } = rawInput ?? {}
            const rewritten = mcpUtils.rewriteAllReferences({ input: rawInputWithoutAuth, trigger: flow.version.trigger })
            const input = {
                ...(existingBlockSettings?.input ?? {}),
                ...(rewritten.input ?? {}),
                ...(auth !== undefined && { auth: `{{connections['${auth}']}}` }),
            }

            const triggerPayload = {
                name: flow.version.trigger.name,
                displayName,
                valid: false,
                lastUpdatedDate: new Date().toISOString(),
                type: FlowTriggerType.BLOCK,
                settings: {
                    blockName: resolvedBlockName,
                    blockVersion,
                    triggerName,
                    input,
                    propertySettings: existingBlockSettings?.propertySettings ?? {},
                },
            }

            const parseResult = BlockTrigger.safeParse(triggerPayload)
            if (!parseResult.success) {
                const message = parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
                return {
                    content: [{ type: 'text', text: `❌ Invalid trigger: ${message}` }],
                }
            }

            const operation: FlowOperationRequest = {
                type: FlowOperationType.UPDATE_TRIGGER,
                request: parseResult.data,
            }

            try {
                const updatedFlow = await flowService(log).update({
                    id: flow.id,
                    projectId: mcp.projectId,
                    userId: null,
                    platformId: project.platformId,
                    operation,
                })
                const trigger = updatedFlow.version.trigger
                const draftWarning = mcpUtils.publishedFlowWarning(flow.publishedVersionId)
                if (!trigger.valid) {
                    const diagnosis = await diagnoseMissingTriggerInputs({ blockName: resolvedBlockName, blockVersion, triggerName, input, platformId: project.platformId, log })
                    const hint = diagnosis ?? 'Check that triggerName is correct and all required inputs are provided. Use ib_list_connections to get a valid connection externalId for auth.'
                    return {
                        content: [{
                            type: 'text',
                            text: `⚠️ Trigger updated but still invalid. ${hint}${draftWarning}`,
                        }],
                    }
                }
                return {
                    content: [{ type: 'text', text: `✅ Successfully updated trigger to "${resolvedBlockName}/${triggerName}".${draftWarning}` }],
                }
            }
            catch (err) {
                return mcpUtils.mcpToolError('Trigger update failed', err)
            }
        },
    }
}

async function diagnoseMissingTriggerInputs({ blockName, blockVersion, triggerName, input, platformId, log }: {
    blockName: string
    blockVersion: string
    triggerName: string
    input: Record<string, unknown>
    platformId: string
    log: FastifyBaseLogger
}): Promise<string | null> {
    try {
        const block = await blockMetadataService(log).getOrThrow({ platformId, name: blockName, version: blockVersion })
        const trigger = block.triggers[triggerName]
        if (isNil(trigger)) {
            return `Trigger "${triggerName}" not found in block "${blockName}". Use ib_research_blocks with includeTriggers=true to get valid trigger names.`
        }
        const { parts, missing, uiRequired, hasAuth } = mcpUtils.diagnoseBlockProps({ props: trigger.props, input, blockAuth: block.auth, requireAuth: trigger.requireAuth, componentType: 'trigger' })
        if (missing.length === 0 && uiRequired.length === 0 && !hasAuth) {
            return 'All inputs are provided but the trigger may need sample data. Ask the user to send a test event or configure the trigger in the Intellisper UI.'
        }
        return parts.join(' ')
    }
    catch (err) {
        log.warn({ err, blockName, triggerName }, 'diagnoseMissingTriggerInputs: failed to fetch block metadata')
        return null
    }
}
