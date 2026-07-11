// Clean-room implementation — chat conversations API (`/v1/chat/conversations`, capability
// spec H.2.b). The control-plane HTTP surface for the conversational agent: conversation CRUD
// and message-history read.
//
// Every route is user + platform scoped via `securityAccess.publicPlatform([USER])`, which
// exposes `request.principal.platform.id` and `request.principal.id` (the user). Conversations
// are private to their owning user; the service reports any out-of-scope id as 404. Chat is a
// plan-gated capability — these routes are only registered in the CLOUD/ENTERPRISE editions
// (see app.ts) and the UI only surfaces them when the platform's `chatEnabled` plan flag is on.
//
// The live streaming turn (send-message → worker execution → realtime stream) is handled by the
// execution plane and its RPC contract (chat-rpc-handlers); this module owns the durable
// conversation record the client reads and manages.
import {
    ibId,
    ChatConversation,
    CreateChatConversationRequest,
    LATEST_JOB_DATA_SCHEMA_VERSION,
    PersistedChatMessage,
    PrincipalType,
    SeekPage,
    SendChatMessageRequest,
    tryCatch,
    UpdateChatConversationRequest,
    WorkerJobType,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { jobQueue, JobType } from '../../workers/job-queue/job-queue'
import { chatConversationService } from './chat-conversation.service'
import { chatRolloutService } from './chat-rollout.service'
import { chatTurnStore } from './chat-turn-store'

const ConversationIdParams = z.object({ id: z.string() })

const ApproveGateRequest = z.object({
    gateId: z.string(),
    approved: z.boolean(),
    payload: z.record(z.string(), z.unknown()).optional(),
})

export const chatModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(chatConversationController, { prefix: '/v1/chat/conversations' })
}

const chatConversationController: FastifyPluginAsyncZod = async (app) => {

    // Create a conversation owned by the caller. Body is optional (title/modelName); projectId is
    // always null on creation.
    app.post('/', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            body: CreateChatConversationRequest,
        },
    }, async (request, reply): Promise<ChatConversation> => {
        const conversation = await chatConversationService(request.log).create({
            platformId: request.principal.platform.id,
            userId: request.principal.id,
            title: request.body.title,
            modelName: request.body.modelName,
        })
        return reply.status(StatusCodes.CREATED).send(conversation)
    })

    // List the caller's conversations (summary view — no message blobs), newest first.
    app.get('/', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
    }, async (request): Promise<SeekPage<ChatConversation>> => {
        // Listing conversations is the chat surface's "landing" — record the rollout-funnel top
        // (fire-and-forget). The funnel is read live by the admin analytics API; nothing is pushed.
        void chatRolloutService(request.log).recordLanded()
        return chatConversationService(request.log).list({
            platformId: request.principal.platform.id,
            userId: request.principal.id,
        })
    })

    // Fetch a single owned conversation (recovers a crashed STREAMING turn to IDLE on read).
    app.get('/:id', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            params: ConversationIdParams,
        },
    }, async (request): Promise<ChatConversation> => {
        return chatConversationService(request.log).getOneOrThrow({
            id: request.params.id,
            platformId: request.principal.platform.id,
            userId: request.principal.id,
        })
    })

    // Update an owned conversation's title/model.
    app.post('/:id', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            params: ConversationIdParams,
            body: UpdateChatConversationRequest,
        },
    }, async (request): Promise<ChatConversation> => {
        return chatConversationService(request.log).update({
            id: request.params.id,
            platformId: request.principal.platform.id,
            userId: request.principal.id,
            title: request.body.title,
            modelName: request.body.modelName,
        })
    })

    // Delete an owned conversation.
    app.delete('/:id', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            params: ConversationIdParams,
        },
    }, async (request, reply): Promise<void> => {
        await chatConversationService(request.log).delete({
            id: request.params.id,
            platformId: request.principal.platform.id,
            userId: request.principal.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    // Send a message and start a streaming turn. Fences the conversation to STREAMING (only one
    // live turn at a time), then enqueues the worker agent job. The response is a run id; the
    // client subscribes to the realtime channel (websocket CHAT_MESSAGE_CHUNK) for the stream. If
    // the enqueue fails the conversation is rolled back to IDLE so it isn't stuck STREAMING.
    app.post('/:id/messages', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            params: ConversationIdParams,
            body: SendChatMessageRequest,
        },
    }, async (request, reply): Promise<{ runId: string }> => {
        const platformId = request.principal.platform.id
        const userId = request.principal.id
        const conversation = await chatConversationService(request.log).startTurnOrThrow({
            id: request.params.id,
            platformId,
            userId,
        })

        const runId = request.body.runId ?? ibId()
        const { error } = await tryCatch(() => jobQueue(request.log).add({
            id: ibId(),
            type: JobType.ONE_TIME,
            data: {
                schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                jobType: WorkerJobType.EXECUTE_CHAT_AGENT,
                conversationId: conversation.id,
                runId,
                projectId: conversation.projectId,
                platformId,
                userId,
                userMessage: request.body.content,
                modelName: conversation.modelName,
                files: request.body.files,
            },
        }))
        if (error) {
            // Roll the fence back so the conversation is usable again.
            await chatConversationService(request.log).markError(conversation.id)
            request.log.error({ err: error, conversationId: conversation.id }, '[chat] Failed to enqueue chat agent job')
            throw error
        }
        // A message was received — record the rollout-funnel bottom (fire-and-forget). Read live by
        // the admin analytics API; nothing is pushed.
        void chatRolloutService(request.log).recordChatted()
        return reply.status(StatusCodes.ACCEPTED).send({ runId })
    })

    // Request cancellation of the conversation's active streaming turn. The worker polls this flag
    // and aborts; this returns immediately (fire-and-forget from the client's perspective).
    app.post('/:id/cancel', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            params: ConversationIdParams,
        },
    }, async (request, reply): Promise<void> => {
        // Ownership check (404 for a conversation that isn't the caller's).
        await chatConversationService(request.log).getOneOrThrow({
            id: request.params.id,
            platformId: request.principal.platform.id,
            userId: request.principal.id,
        })
        await chatTurnStore.requestCancel(request.params.id)
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    // Approve or reject an open approval gate (human-in-the-loop, H.2.e). First decision wins; a
    // duplicate or unknown gate is a no-op reported as { applied: false }.
    app.post('/:id/gates', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            params: ConversationIdParams,
            body: ApproveGateRequest,
        },
    }, async (request): Promise<{ applied: boolean }> => {
        // Ownership check (404 for a conversation that isn't the caller's).
        await chatConversationService(request.log).getOneOrThrow({
            id: request.params.id,
            platformId: request.principal.platform.id,
            userId: request.principal.id,
        })
        const applied = await chatTurnStore.decideGate({
            gateId: request.body.gateId,
            approved: request.body.approved,
            payload: request.body.payload,
        })
        return { applied }
    })

    // Read an owned conversation's persisted message history.
    app.get('/:id/messages', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            params: ConversationIdParams,
        },
    }, async (request): Promise<SeekPage<PersistedChatMessage>> => {
        const messages = await chatConversationService(request.log).getMessages({
            id: request.params.id,
            platformId: request.principal.platform.id,
            userId: request.principal.id,
        })
        return paginationHelper.createPage(messages, null)
    })
}
