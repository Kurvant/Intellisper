// Clean-room implementation — chat cross-project tool executor + turn-coordination dispatcher
// (capability spec H.2.e / H.2.f). The worker's agent loop calls executeChatTool for the handful
// of tools that must run in the control plane (they touch real project data or need secret
// connection material the worker must never hold) and for the coordination pseudo-operations that
// drive the human-in-the-loop gates, cancellation, and connection selection.
//
// Two families, dispatched by tool name:
//
//   Cross-project tools (run against the conversation's active project, resolving the user-selected
//   connection server-side so secrets never reach the model):
//     - ib_discover_action_auth  → does this block/action need a connection, and what's available?
//     - ib_execute_action        → run a single block action (ad-hoc, via the shared executor)
//     - ib_explore_data          → read-only variant of the above (discovery)
//     - ib_list_across_projects  → list flows/tables/runs/connections across the user's workspaces
//
//   Coordination pseudo-operations (prefixed `__`, never model-visible tools):
//     - __cancel_check            → has the user asked to stop this turn?
//     - __approval_wait           → the worker's long-poll for a gate decision
//     - __store_pending_gate      → register a gate the agent just opened (fail-closed: pending)
//     - __store_selected_connection → record the connection the user picked, for later actions
import {
    AppConnectionStatus,
    ExecuteChatToolRequest,
    ExecuteChatToolResponse,
    isNil,
    isObject,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { appConnectionService } from '../../app-connection/app-connection-service/app-connection-service'
import { flowService } from '../../flows/flow/flow.service'
import { flowRunService } from '../../flows/flow-run/flow-run-service'
import { executeAdhocAction } from '../../mcp/tools/flow-run-utils'
import { mcpUtils } from '../../mcp/tools/mcp-utils'
import { blockMetadataService } from '../../pieces/metadata/piece-metadata-service'
import { projectService } from '../../project/project-service'
import { tableService } from '../../tables/table/table.service'
import { userService } from '../../user/user-service'
import { chatConversationService } from './chat-conversation.service'
import { chatTurnStore } from './chat-turn-store'

const CROSS_PROJECT_LIST_LIMIT = 50

// Resolve the project a cross-project tool runs in: the conversation's bound project, or the
// user's default project when none is selected yet. Throws if neither can be resolved.
async function resolveActiveProjectId({ conversationId, userId, log }: {
    conversationId: string | undefined
    userId: string
    log: FastifyBaseLogger
}): Promise<string> {
    if (!isNil(conversationId)) {
        const conversation = await chatConversationService(log).getByIdUnscoped(conversationId)
        if (!isNil(conversation?.projectId)) {
            return conversation.projectId
        }
    }
    const project = await projectService(log).getUserProjectOrThrow(userId)
    return project.id
}

// Look up the user's most-recently selected connection for a block (recorded by the display tools
// via __store_selected_connection); returns its externalId if present.
async function resolveConnectionExternalId({ conversationId, blockName }: {
    conversationId: string | undefined
    blockName: string
}): Promise<string | undefined> {
    if (isNil(conversationId)) {
        return undefined
    }
    const selected = await chatTurnStore.getSelectedConnection({ conversationId, blockName })
    return selected?.connectionExternalId
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return isObject(value) ? value as Record<string, unknown> : undefined
}

export const chatToolExecutor = (log: FastifyBaseLogger) => ({
    async executeChatTool(input: ExecuteChatToolRequest): Promise<ExecuteChatToolResponse> {
        const { toolName, toolInput, platformId, userId, conversationId } = input

        switch (toolName) {
            // ---- Coordination pseudo-operations -------------------------------------------------
            case '__cancel_check': {
                const targetConversationId = asString(toolInput['conversationId']) ?? conversationId
                if (isNil(targetConversationId)) {
                    return { result: false }
                }
                return { result: await chatTurnStore.isCancelRequested(targetConversationId) }
            }
            case '__approval_wait': {
                const gateId = asString(toolInput['gateId'])
                if (isNil(gateId)) {
                    return { result: 'pending' }
                }
                return { result: await chatTurnStore.pollGate(gateId) }
            }
            case '__store_pending_gate': {
                const gateId = asString(toolInput['gateId'])
                const gateTool = asString(toolInput['toolName'])
                if (isNil(gateId) || isNil(gateTool)) {
                    return { result: { stored: false } }
                }
                await chatTurnStore.storePendingGate({
                    gateId,
                    toolName: gateTool,
                    displayName: asString(toolInput['displayName']) ?? gateTool,
                    toolInput: asRecord(toolInput['toolInput']) ?? {},
                })
                return { result: { stored: true } }
            }
            case '__store_selected_connection': {
                const blockName = asString(toolInput['blockName'])
                const connectionExternalId = asString(toolInput['connectionExternalId'])
                if (isNil(conversationId) || isNil(blockName) || isNil(connectionExternalId)) {
                    return { result: { stored: false } }
                }
                await chatTurnStore.storeSelectedConnection({
                    conversationId,
                    connection: {
                        blockName,
                        connectionExternalId,
                        label: asString(toolInput['label']) ?? connectionExternalId,
                        projectId: asString(toolInput['projectId']) ?? '',
                    },
                })
                return { result: { stored: true } }
            }

            // ---- Cross-project tools ------------------------------------------------------------
            case 'ib_discover_action_auth':
                return { result: await this.discoverActionAuth({ toolInput, platformId, userId, conversationId }) }
            case 'ib_execute_action':
            case 'ib_explore_data':
                return { result: await this.executeAction({ toolInput, userId, conversationId }) }
            case 'ib_list_across_projects':
                return { result: await this.listAcrossProjects({ toolInput, platformId, userId }) }

            default:
                log.warn({ toolName, conversationId }, '[chatToolExecutor] Unknown chat tool')
                return { result: { error: `Unknown tool "${toolName}".` } }
        }
    },

    // Does this block/action need a connection, and which are available in the active project?
    async discoverActionAuth({ toolInput, platformId, userId, conversationId }: {
        toolInput: Record<string, unknown>
        platformId: string
        userId: string
        conversationId: string | undefined
    }): Promise<unknown> {
        const blockName = asString(toolInput['blockName'])
        if (isNil(blockName)) {
            return { error: 'blockName is required.' }
        }
        const projectId = await resolveActiveProjectId({ conversationId, userId, log })
        const normalized = mcpUtils.normalizeBlockName(blockName)
        const block = isNil(normalized)
            ? null
            : await blockMetadataForAuth({ blockName: normalized, projectId, platformId, log })
        if (isNil(block)) {
            return { needsConnection: false, noAuthRequired: true, block: blockName }
        }
        if (isNil(block.auth)) {
            return { noAuthRequired: true, block: blockName }
        }
        const connections = await appConnectionService(log).list({
            projectId,
            platformId,
            cursorRequest: null,
            scope: undefined,
            displayName: undefined,
            status: [AppConnectionStatus.ACTIVE],
            blockName: normalized,
            limit: 200,
            externalIds: undefined,
        })
        const options = connections.data.map((connection) => ({
            label: connection.displayName,
            project: projectId,
            externalId: connection.externalId,
            projectId,
            status: connection.status,
        }))
        if (options.length === 0) {
            return { needsConnection: true, block: blockName, displayName: block.displayName }
        }
        return { pickConnection: true, block: blockName, displayName: block.displayName, connections: options }
    },

    // Run a single block action ad-hoc in the active project, using the user-selected connection.
    async executeAction({ toolInput, userId, conversationId }: {
        toolInput: Record<string, unknown>
        userId: string
        conversationId: string | undefined
    }): Promise<unknown> {
        const blockName = asString(toolInput['blockName'])
        const actionName = asString(toolInput['actionName'])
        if (isNil(blockName) || isNil(actionName)) {
            return { success: false, error: 'blockName and actionName are required.' }
        }
        const projectId = await resolveActiveProjectId({ conversationId, userId, log })
        const connectionExternalId = await resolveConnectionExternalId({ conversationId, blockName })
        return executeAdhocAction({
            projectId,
            blockName,
            actionName,
            input: asRecord(toolInput['input']),
            connectionExternalId,
            log,
        })
    },

    // List a resource across all the user's accessible projects.
    async listAcrossProjects({ toolInput, platformId, userId }: {
        toolInput: Record<string, unknown>
        platformId: string
        userId: string
    }): Promise<unknown> {
        const resource = asString(toolInput['resource'])
        const user = await userService(log).getOneOrFail({ id: userId })
        const projects = await projectService(log).getAllForUser({
            platformId,
            userId,
            isPrivileged: userService(log).isUserPrivileged(user),
        })

        const lines: string[] = []
        for (const project of projects) {
            const items = await listResourceInProject({ resource, projectId: project.id, platformId, log })
            if (items.length > 0) {
                lines.push(`Project "${project.displayName}" (${project.id}):`)
                lines.push(...items.map((item) => `  - ${item}`))
            }
        }
        const text = lines.length > 0
            ? `Found ${resource ?? 'resources'} across ${projects.length} project(s):\n${lines.join('\n')}`
            : `No ${resource ?? 'resources'} found across your projects.`
        return { content: [{ type: 'text', text }] }
    },
})

// A lightweight block lookup that returns { auth, displayName } for the auth-discovery path.
// Resolves block metadata directly (a block may need auth regardless of which action is run).
async function blockMetadataForAuth({ blockName, projectId, platformId, log }: {
    blockName: string
    projectId: string
    platformId: string
    log: FastifyBaseLogger
}): Promise<{ auth: unknown, displayName: string } | null> {
    const block = await blockMetadataService(log).get({ name: blockName, projectId, platformId })
    if (isNil(block)) {
        return null
    }
    return { auth: block.auth, displayName: block.displayName }
}

async function listResourceInProject({ resource, projectId, platformId, log }: {
    resource: string | undefined
    projectId: string
    platformId: string
    log: FastifyBaseLogger
}): Promise<string[]> {
    switch (resource) {
        case 'flows': {
            const page = await flowService(log).list({
                // `list` takes projectIds XOR platformId; this helper is already project-scoped.
                projectIds: [projectId],
                cursorRequest: null,
                limit: CROSS_PROJECT_LIST_LIMIT,
                folderId: undefined,
                status: undefined,
                name: undefined,
                versionState: undefined,
                connectionExternalIds: undefined,
                agentExternalIds: undefined,
            })
            return page.data.map((flow) => `flow ${flow.id}: ${flow.version.displayName} [${flow.status}]`)
        }
        case 'tables': {
            // `tableService` is a plain object, not a logger-bound factory (cf. project-state.service).
            const page = await tableService.list({
                projectId,
                cursor: undefined,
                limit: CROSS_PROJECT_LIST_LIMIT,
                name: undefined,
                externalIds: undefined,
                folderId: undefined,
                folderIds: undefined,
                includeRowCount: false,
            })
            return page.data.map((table) => `table ${table.id}: ${table.name}`)
        }
        case 'runs': {
            const page = await flowRunService(log).list({
                // `list` is project-scoped; it has no platformId param (projectId is the tighter filter).
                projectId,
                cursor: null,
                limit: CROSS_PROJECT_LIST_LIMIT,
                flowId: undefined,
                tags: undefined,
                status: undefined,
                createdAfter: undefined,
                createdBefore: undefined,
                flowRunIds: undefined,
                environment: undefined,
                failedStepName: undefined,
            })
            return page.data.map((run) => `run ${run.id}: ${run.status} (${run.created})`)
        }
        case 'connections': {
            const page = await appConnectionService(log).list({
                projectId,
                platformId,
                cursorRequest: null,
                scope: undefined,
                displayName: undefined,
                status: undefined,
                blockName: undefined,
                limit: CROSS_PROJECT_LIST_LIMIT,
                externalIds: undefined,
            })
            return page.data.map((connection) => `connection ${connection.externalId}: "${connection.displayName}" (${connection.blockName}) [${connection.status}]`)
        }
        default:
            return []
    }
}
