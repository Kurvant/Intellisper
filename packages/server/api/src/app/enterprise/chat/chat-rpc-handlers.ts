// Clean-room implementation — chat/agent live-turn control-plane RPC handlers (worker → api),
// capability spec H.2.d–i. These are the worker's callbacks into the API DURING a live streaming
// turn: the worker (execution plane) holds no DB and no secrets, so every stateful operation of a
// turn routes here. Each method is a thin delegation to the service that owns that concern:
//
//   - getChatConfig       → chatConfigService (provider/tier + prompt + compacted history + MCP
//                           token + projects + guides). Assembles everything the model loop needs.
//   - saveChatMessages    → persist the final model/UI message log and return the conversation to
//                           IDLE (turn complete), optionally recording an auto-title/model.
//   - updateChatProgress  → rolling UI-message heartbeat mid-turn (keeps STREAMING, bumps updated).
//   - updateProjectContext→ bind/clear the conversation's active project (ib_select_project).
//   - executeChatTool     → chatToolExecutor: cross-project tools + turn-coordination pseudo-ops.
//
// These run behind the WORKER principal (the worker-rpc-service authenticates the caller), so they
// address conversations by id without a user/platform scope check — the worker only ever receives
// ids it was handed by the enqueue path.
import {
    ChatConfigResponse,
    ExecuteChatToolRequest,
    ExecuteChatToolResponse,
    GetChatConfigRequest,
    isNil,
    PersistedChatMessage,
    SaveChatMessagesRequest,
    UpdateChatProgressRequest,
    UpdateProjectContextRequest,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { chatConfigService } from './chat-config.service'
import { chatConversationService } from './chat-conversation.service'
import { chatToolExecutor } from './chat-tool-executor'
import { chatTurnStore } from './chat-turn-store'
import { chatMetricsRecorder } from './telemetry/chat-metrics-recorder'
import { countToolCallsInLatestTurn } from './telemetry/chat-telemetry-helpers'

export const chatRpcHandlers = (log: FastifyBaseLogger) => ({
    async getChatConfig(input: GetChatConfigRequest): Promise<ChatConfigResponse> {
        return chatConfigService(log).getChatConfig(input)
    },

    async saveChatMessages(input: SaveChatMessagesRequest): Promise<void> {
        // The worker sends an empty-message payload on its error path purely as a best-effort
        // signal; treat that as a no-op save (the conversation is failed via markError elsewhere)
        // rather than clobbering the persisted history with nothing.
        if (input.messages.length === 0 && input.uiMessages.length === 0) {
            return
        }
        await chatConversationService(log).saveTurn({
            id: input.conversationId,
            messages: input.messages as Array<Record<string, unknown>>,
            uiMessages: input.uiMessages as PersistedChatMessage[],
            title: input.title,
            modelName: input.modelName,
        })
        // The turn is over; clear any cancellation flag so the next turn starts clean.
        await chatTurnStore.clearCancel(input.conversationId)

        // Fire-and-forget internal-admin metric (H.2.m): a real turn completed, so record ONE local
        // metric row (no outbound HTTP). NOT awaited into the RPC response path, and the recorder
        // swallows all errors internally, so metrics can never slow or fail the turn.
        const conversation = await chatConversationService(log).getByIdUnscoped(input.conversationId)
        if (!isNil(conversation)) {
            const turnToolCount = countToolCallsInLatestTurn(input.uiMessages as PersistedChatMessage[])
            void chatMetricsRecorder(log).recordMessageMetric({ conversation, turnToolCount })
        }
    },

    async updateChatProgress(input: UpdateChatProgressRequest): Promise<void> {
        await chatConversationService(log).updateProgress({
            id: input.conversationId,
            uiMessages: input.uiMessages as PersistedChatMessage[],
        })
    },

    async updateProjectContext(input: UpdateProjectContextRequest): Promise<void> {
        // Only bind a project the record actually resolves — guard against a stale conversation id.
        const conversation = await chatConversationService(log).getByIdUnscoped(input.conversationId)
        if (isNil(conversation)) {
            return
        }
        await chatConversationService(log).setProjectContext({
            id: input.conversationId,
            projectId: input.projectId,
        })
    },

    async executeChatTool(input: ExecuteChatToolRequest): Promise<ExecuteChatToolResponse> {
        return chatToolExecutor(log).executeChatTool(input)
    },
})
