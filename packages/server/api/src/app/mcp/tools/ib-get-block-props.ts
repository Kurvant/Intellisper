import { BlockPropertyMap, PropertyType } from '@intelblocks/blocks-framework'
import {
    AppConnectionStatus,
    EngineResponse,
    EngineResponseStatus,
    FlowVersion,
    isNil,
    isObject,
    McpToolDefinition,
    ProjectScopedMcpServer,
    SampleDataFileType,
    WorkerJobType,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { appConnectionService } from '../../app-connection/app-connection-service/app-connection-service'
import { flowService } from '../../flows/flow/flow.service'
import { sampleDataService } from '../../flows/step-run/sample-data.service'
import { getBlockPackageWithoutArchive } from '../../pieces/metadata/piece-metadata-service'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { mcpUtils, PropSummary } from './mcp-utils'

export const ibGetBlockPropsTool = (mcp: ProjectScopedMcpServer, log: FastifyBaseLogger): McpToolDefinition => {
    return {
        title: 'ib_get_block_props',
        description: 'Get the input property schema for a block action or trigger. Returns field names, types, required/optional, defaults, and options. Pass auth to resolve dynamic dropdowns and dynamic property sub-fields (e.g. Custom API Call url/body fields).',
        inputSchema: getBlockPropsInput.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: async (args) => {
            try {
                const { blockName, actionOrTriggerName, type, auth, flowId, input: providedInput } = getBlockPropsInput.parse(args)

                const platformId = await mcpUtils.resolvePlatformId({ mcp, log })
                const projectId = mcpUtils.isProjectScoped(mcp) ? mcp.projectId : undefined
                const lookup = await mcpUtils.lookupBlockComponent({
                    blockName,
                    componentName: actionOrTriggerName,
                    componentType: type,
                    projectId,
                    platformId,
                    log,
                })
                if (lookup.error) {
                    return lookup.error
                }

                const { block, component, blockName: normalized } = lookup
                const label = type === 'action' ? 'Action' : 'Trigger'
                const props = mcpUtils.buildPropSummaries(component.props)
                const requiresAuth = component.requireAuth && !isNil(block.auth)

                const hasRealProject = mcpUtils.isProjectScoped(mcp)
                let authHint: AuthHint | undefined
                if (hasRealProject && requiresAuth && auth) {
                    const authOwnership = await validateAuthOwnership({ auth, blockName: normalized, projectId: mcp.projectId, platformId, log })
                    if (authOwnership) {
                        return authOwnership
                    }
                }
                if (requiresAuth && !auth) {
                    if (hasRealProject) {
                        authHint = await discoverAvailableConnections({ blockName: normalized, projectId: mcp.projectId, platformId, log })
                    }
                    else {
                        authHint = { message: 'Select a project with ib_set_project_context to see available connections.', connections: [] }
                    }
                }

                if (hasRealProject) {
                    await resolvePropertyOptions({
                        props,
                        componentProps: component.props,
                        blockName: normalized,
                        blockVersion: block.version,
                        actionOrTriggerName,
                        auth,
                        flowId,
                        providedInput: providedInput ?? {},
                        projectId: mcp.projectId,
                        platformId,
                        log,
                    })
                }

                const textResult = {
                    block: normalized,
                    name: component.name,
                    displayName: component.displayName,
                    description: component.description,
                    requiresAuth,
                    ...(authHint && { authHint }),
                    props,
                }
                const structured = {
                    block: normalized,
                    name: component.name,
                    displayName: component.displayName,
                    description: component.description,
                    requiresAuth,
                    props,
                }

                const descLine = component.description ? `\nDescription: ${component.description}\n` : ''
                return {
                    content: [{ type: 'text', text: `✅ ${label} schema for "${normalized}/${actionOrTriggerName}":${descLine}\n${JSON.stringify(textResult, null, 2)}` }],
                    structuredContent: structured,
                }
            }
            catch (err) {
                return mcpUtils.mcpToolError('Failed to get block props', err)
            }
        },
    }
}

async function resolvePropertyOptions({ props, componentProps, blockName, blockVersion, actionOrTriggerName, auth, flowId, providedInput, projectId, platformId, log }: ResolvePropertyOptionsParams): Promise<void> {
    const resolvableProps = mcpUtils.findResolvableProps({ props, componentProps, auth, providedInput })
    if (resolvableProps.length === 0) {
        return
    }

    const flow = flowId ? await flowService(log).getOnePopulated({ id: flowId, projectId }) : null

    const [blockPackage, sampleData] = await Promise.all([
        getBlockPackageWithoutArchive(log, platformId, { blockName, blockVersion }),
        flow
            ? sampleDataService(log).getSampleDataForFlow(projectId, flow.version, SampleDataFileType.OUTPUT)
            : Promise.resolve({} as Record<string, unknown>),
    ])
    const flowVersion: FlowVersion | undefined = flow?.version

    const input: Record<string, unknown> = {
        ...providedInput,
        ...(auth ? { auth: `{{connections['${auth}']}}` } : {}),
    }

    await Promise.all(resolvableProps.map(async (prop) => {
        try {
            const result = await withTimeout({
                promise: userInteractionWatcher.submitAndWaitForResponse<EngineResponse<{
                    options: Array<{ label: string, value: unknown }> | BlockPropertyMap
                    disabled?: boolean
                }>>({
                    jobType: WorkerJobType.EXECUTE_PROPERTY,
                    platformId,
                    projectId,
                    flowVersion,
                    propertyName: prop.name,
                    actionOrTriggerName,
                    input,
                    sampleData,
                    searchValue: undefined,
                    block: blockPackage,
                }, log),
                ms: PROPERTY_TIMEOUT_MS,
            })

            if (result.status !== EngineResponseStatus.OK || isNil(result.response?.options)) {
                return
            }

            const { options } = result.response
            if (prop.type === PropertyType.DYNAMIC && isObject(options) && !Array.isArray(options)) {
                prop.dynamicFields = mcpUtils.buildPropSummaries(options)
                prop.note = undefined
            }
            else if (Array.isArray(options)) {
                prop.options = options.map((o: { label: string, value: unknown }) => ({ label: o.label, value: o.value }))
                prop.note = undefined
            }
        }
        catch (err) {
            log.warn({ err, propertyName: prop.name }, 'Failed to resolve property options — dropdown will be empty. Try calling ib_get_block_props again with auth.')
        }
    }))
}

async function discoverAvailableConnections({ blockName, projectId, platformId, log }: {
    blockName: string
    projectId: string
    platformId: string
    log: FastifyBaseLogger
}): Promise<AuthHint> {
    try {
        const connections = await appConnectionService(log).list({
            projectId,
            platformId,
            blockName,
            cursorRequest: null,
            scope: undefined,
            displayName: undefined,
            status: [AppConnectionStatus.ACTIVE],
            limit: 10,
            externalIds: undefined,
        })
        const active = connections.data
            .map(c => ({ externalId: c.externalId, displayName: c.displayName }))
        if (active.length > 0) {
            return { message: 'Pass one as the auth param.', connections: active }
        }
        return { message: 'No connections found. Set up in UI or use ib_setup_guide.', connections: [] }
    }
    catch (err) {
        log.debug({ err, blockName }, 'Failed to discover connections')
        return { message: 'Use ib_list_connections to find connections.', connections: [] }
    }
}

async function validateAuthOwnership({ auth, blockName, projectId, platformId, log }: {
    auth: string
    blockName: string
    projectId: string
    platformId: string
    log: FastifyBaseLogger
}): Promise<{ content: [{ type: 'text', text: string }] } | null> {
    try {
        const connections = await appConnectionService(log).list({
            projectId,
            platformId,
            blockName,
            cursorRequest: null,
            scope: undefined,
            displayName: undefined,
            status: undefined,
            limit: 1,
            externalIds: [auth],
        })
        const match = connections.data[0]
        if (!match) {
            return {
                content: [{
                    type: 'text',
                    text: `⚠️ Connection "${auth}" does not belong to block "${blockName}". Use ib_list_connections to find the correct connection for this block.`,
                }],
            }
        }
    }
    catch {
        // If lookup fails, proceed anyway — don't block the user
    }
    return null
}

const { withTimeout } = mcpUtils

const getBlockPropsInput = z.object({
    blockName: z.string().describe('The block name (e.g. "@intelblocks/block-slack"). Use ib_research_blocks to get valid values.'),
    actionOrTriggerName: z.string().describe('The action or trigger name (e.g. "send_channel_message"). Use ib_research_blocks with blockNames to get valid values.'),
    type: z.enum(['action', 'trigger']).describe('Whether to look up an action or a trigger.'),
    auth: z.string().optional().describe('Connection externalId from ib_list_connections. When provided, dynamic dropdowns and dynamic property sub-fields are resolved via your account.'),
    flowId: z.string().optional().describe('Flow ID for resolving dependent dropdowns that need step context. Optional — most dropdowns work without it.'),
    input: z.record(z.string(), z.unknown()).optional().describe('Known input values to resolve dependent dynamic properties.'),
})

const PROPERTY_TIMEOUT_MS = 30_000

type ResolvePropertyOptionsParams = {
    props: PropSummary[]
    componentProps: BlockPropertyMap
    blockName: string
    blockVersion: string
    actionOrTriggerName: string
    auth: string | undefined
    flowId: string | undefined
    providedInput: Record<string, unknown>
    projectId: string
    platformId: string
    log: FastifyBaseLogger
}

type AuthHint = {
    message: string
    connections: Array<{ externalId: string, displayName: string }>
}
