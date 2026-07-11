// Clean-room implementation — chat turn config assembler (capability spec H.2.d / H.2.f / H.2.h /
// H.2.i). This is the control-plane half the worker calls once at the start of every turn
// (getChatConfig): it resolves everything the streaming model loop needs but must NOT compute
// itself (it has no DB access and must never see raw secrets until this trusted RPC hands them
// over). It assembles:
//
//   - provider/auth/providerConfig/modelId + tier (H.2.i) — via the platform's chat AI provider
//     (aiProviderService.getChatProvider) and the shared chat tiers. Secret material (provider
//     auth) travels ONLY over this worker RPC, never to the client.
//   - systemPrompt (H.2.d) — the embedded chat system prompt with the project list + active
//     project context + frontend URL substituted in.
//   - messages / allMessages (H.2.h) — the full model-message log plus a compacted view that fits
//     the provider's context window (chatCompaction).
//   - previousUiMessages (H.2.b) — the persisted UI history plus the just-sent user turn, so the
//     worker can append the assistant reply and detect the first turn (for auto-title).
//   - mcpCredentials (H.2.f) — a short-lived internal MCP OAuth token + the MCP server URL, so the
//     worker can open the tool channel scoped to this conversation's project.
//   - projects (H.2.f) — the user's accessible workspaces, for cross-project tools.
//   - guides (H.2.d) — the on-demand playbooks the agent loads by topic.
import {
    INTELLISPER_CHAT_TIERS,
    IntellisperChatTier,
    AIProviderName,
    ChatConfigResponse,
    DEFAULT_CHAT_TIER_ID,
    GetChatConfigRequest,
    isNil,
    PersistedChatMessage,
    PersistedChatPartType,
    PersistedChatRole,
    Project,
} from '@intelblocks/shared'
import { ModelMessage } from 'ai'
import { FastifyBaseLogger } from 'fastify'
import { aiProviderService } from '../../ai/ai-provider-service'
import { chatCompaction } from '../../chat/chat-compaction'
import { domainHelper } from '../../helper/domain-helper'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { mcpOAuthTokenService } from '../../mcp/oauth/token/mcp-oauth-token.service'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { chatConversationService } from './chat-conversation.service'
import {
    CHAT_GUIDES,
    CHAT_PROJECT_CONTEXT_NONE,
    CHAT_PROJECT_CONTEXT_SELECTED,
    CHAT_SYSTEM_PROMPT_TEMPLATE,
} from './chat-prompt-assets'

// The MCP server is mounted at /mcp (project-scoped) — the same endpoint the mcp-oauth controller
// re-scopes to the conversation's project via the x-ap-conversation-id header the worker sends.
const MCP_SERVER_PATH = '/mcp'

function resolveTier(modelName: string | null): IntellisperChatTier {
    const requested = INTELLISPER_CHAT_TIERS.find((tier) => tier.id === modelName)
    if (requested) {
        return requested
    }
    const fallback = INTELLISPER_CHAT_TIERS.find((tier) => tier.id === DEFAULT_CHAT_TIER_ID)
    // DEFAULT_CHAT_TIER_ID is always present in INTELLISPER_CHAT_TIERS; the non-null assertion is
    // safe and keeps the return type non-optional.
    return fallback ?? INTELLISPER_CHAT_TIERS[0]
}

// Build the user's turn as a model message. Attached files become image/file content parts
// alongside the text; a text-only message stays a plain string for the widest provider support.
function buildUserModelMessage(userMessage: string, files: GetChatConfigRequest['files']): ModelMessage {
    if (isNil(files) || files.length === 0) {
        return { role: 'user', content: userMessage }
    }
    const parts: Array<Record<string, unknown>> = []
    if (userMessage.length > 0) {
        parts.push({ type: 'text', text: userMessage })
    }
    for (const file of files) {
        if (file.mimeType.startsWith('image/')) {
            parts.push({ type: 'image', image: file.data, mediaType: file.mimeType })
        }
        else {
            parts.push({ type: 'file', data: file.data, mediaType: file.mimeType, filename: file.name })
        }
    }
    return { role: 'user', content: parts as ModelMessage['content'] }
}

function buildUserUiMessage(userMessage: string): PersistedChatMessage {
    return {
        role: PersistedChatRole.USER,
        parts: [{ type: PersistedChatPartType.TEXT, text: userMessage }],
    }
}

function renderProjectList(projects: Project[]): string {
    if (projects.length === 0) {
        return '(no projects available)'
    }
    return projects.map((project) => `- ${project.displayName} (ID: ${project.id})`).join('\n')
}

function renderProjectContext({ activeProject, frontendUrl }: { activeProject: Project | null, frontendUrl: string }): string {
    if (isNil(activeProject)) {
        return CHAT_PROJECT_CONTEXT_NONE
    }
    return CHAT_PROJECT_CONTEXT_SELECTED
        .replace(/\{\{PROJECT_NAME\}\}/g, activeProject.displayName)
        .replace(/\{\{PROJECT_ID\}\}/g, activeProject.id)
        .replace(/\{\{FRONTEND_URL\}\}/g, frontendUrl)
}

function buildSystemPrompt({ projects, activeProject, frontendUrl }: {
    projects: Project[]
    activeProject: Project | null
    frontendUrl: string
}): string {
    return CHAT_SYSTEM_PROMPT_TEMPLATE
        .replace(/\{\{PROJECT_LIST\}\}/g, renderProjectList(projects))
        .replace(/\{\{PROJECT_CONTEXT\}\}/g, renderProjectContext({ activeProject, frontendUrl }))
        .replace(/\{\{FRONTEND_URL\}\}/g, frontendUrl)
}

export const chatConfigService = (log: FastifyBaseLogger) => ({
    async getChatConfig(input: GetChatConfigRequest): Promise<ChatConfigResponse> {
        const { conversationId, platformId, userId, userMessage, modelName, files } = input

        const conversation = await chatConversationService(log).getByIdUnscopedOrThrow(conversationId)

        // 1) Provider + tier + model. When the platform has a chat provider configured we use it;
        //    otherwise we fall back to the managed Intellisper provider tier's model id. Provider
        //    auth is secret and only ever leaves the control plane over this worker RPC.
        const chatProvider = await aiProviderService(log).getChatProvider({ platformId })
        const tier = resolveTier(modelName)
        const provider = chatProvider?.provider ?? AIProviderName.INTELLISPER
        const auth = (chatProvider?.auth ?? {}) as Record<string, unknown>
        const providerConfig = (chatProvider?.config ?? {}) as Record<string, unknown>
        const modelId = tier.modelId

        // 2) Accessible projects + the active project context.
        const user = await userService(log).getOneOrFail({ id: userId })
        const projects = await projectService(log).getAllForUser({
            platformId,
            userId,
            isPrivileged: userService(log).isUserPrivileged(user),
        })
        const activeProject = isNil(conversation.projectId)
            ? null
            : projects.find((project) => project.id === conversation.projectId) ?? null

        const frontendUrl = (system.get(AppSystemProp.FRONTEND_URL) ?? '').replace(/\/+$/, '')
        const systemPrompt = buildSystemPrompt({ projects, activeProject, frontendUrl })

        // 3) Message history. Append the new user turn to the persisted log, compact it to fit the
        //    provider context window, and surface the prior UI messages plus this user's UI turn.
        const priorModelMessages = (conversation.messages ?? []) as unknown as ModelMessage[]
        const userModelMessage = buildUserModelMessage(userMessage, files)
        const allMessages: ModelMessage[] = [...priorModelMessages, userModelMessage]

        const compactedMessages = chatCompaction.buildCompactedPayload({
            messages: allMessages,
            summary: conversation.summary,
            summarizedUpToIndex: conversation.summarizedUpToIndex,
            provider,
        })

        const previousUiMessages: PersistedChatMessage[] = [
            ...(conversation.uiMessages ?? []),
            buildUserUiMessage(userMessage),
        ]

        // 4) MCP tool channel: a short-lived internal MCP OAuth token scoped to the conversation's
        //    project, plus the MCP server URL. The worker sends the conversation id header so the
        //    server re-scopes to the right project for the token's user.
        const mcpToken = await mcpOAuthTokenService.issueInternalAccessToken({
            userId,
            platformId,
            projectId: conversation.projectId,
        })
        const mcpServerUrl = await domainHelper.getPublicUrl({ path: MCP_SERVER_PATH })

        return {
            provider,
            auth,
            providerConfig,
            modelId,
            systemPrompt,
            messages: compactedMessages as unknown[],
            allMessages: allMessages as unknown[],
            previousUiMessages,
            tier: { id: tier.id, thinkingBudget: tier.thinkingBudget, modelId: tier.modelId },
            mcpCredentials: { mcpServerUrl, mcpToken },
            projects: projects.map((project) => ({ id: project.id, displayName: project.displayName, type: project.type })),
            guides: CHAT_GUIDES,
        }
    },
})
