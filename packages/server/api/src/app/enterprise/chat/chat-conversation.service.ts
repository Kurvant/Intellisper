// Clean-room implementation — chat conversation persistence & control-plane service
// (capability spec H.2.b / H.2.c).
//
// Owns the conversation record: create/list/get/update/delete plus the message history read.
// Every operation is scoped to BOTH the owning platform and the owning user — a conversation is
// private to the user who created it, and never visible across platforms. A missing OR
// out-of-scope conversation is reported uniformly as ENTITY_NOT_FOUND (404), so a caller cannot
// distinguish "does not exist" from "belongs to someone else".
//
// Conversations are user-scoped, not project-scoped: `projectId` is null on creation. A project
// is only associated later when the agent's `ib_select_project` tool binds the turn to a
// workspace (H.2.f); that binding does not change ownership.
//
// Liveness recovery (H.2.c): a turn marks the conversation STREAMING while the worker runs and
// heartbeats `updated`. If the worker dies mid-turn the row is left STREAMING forever. On every
// read we treat a STREAMING conversation whose `updated` is older than STREAMING_STALE_MS as a
// crashed turn and recover it to IDLE (persisted, so the client and subsequent reads see a
// usable conversation). IDLE/ERROR are never affected by staleness.
import {
    ChatConversation,
    ChatConversationStatus,
    ErrorCode,
    ibId,
    IntellisperError,
    isNil,
    PersistedChatMessage,
    SeekPage,
    spreadIfDefined,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { jsonbArray } from '../../core/db/jsonb-column'
import { repoFactory } from '../../core/db/repo-factory'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { ChatConversationEntity } from './chat-conversation-entity'

const conversationRepo = repoFactory(ChatConversationEntity)

// A STREAMING conversation is considered crashed once its heartbeat is older than this. The
// worker heartbeats far more frequently than this window, so a gap this large means the turn
// is dead and the conversation should be recovered to IDLE.
const STREAMING_STALE_MS = 2 * 60 * 1000

// Summary fields for the list view — deliberately excludes the heavy `messages`/`uiMessages`
// blobs and the `summary` text so a list response stays small.
const LIST_SELECT = ['id', 'platformId', 'projectId', 'userId', 'title', 'modelName', 'status', 'created', 'updated'] as const

type Scope = {
    platformId: string
    userId: string
}

function notFound(id: string): IntellisperError {
    return new IntellisperError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        params: { entityType: 'chat_conversation', entityId: id },
    })
}

// If the conversation is a stale STREAMING row, recover it to IDLE in place (persisting the
// change) and return the recovered view; otherwise return it unchanged.
async function recoverIfStale(conversation: ChatConversation): Promise<ChatConversation> {
    if (conversation.status !== ChatConversationStatus.STREAMING) {
        return conversation
    }
    const updatedAtMs = new Date(conversation.updated).getTime()
    const isStale = Date.now() - updatedAtMs > STREAMING_STALE_MS
    if (!isStale) {
        return conversation
    }
    // Only flip rows that are still STREAMING — a concurrent worker heartbeat/finish must win.
    await conversationRepo().update(
        { id: conversation.id, status: ChatConversationStatus.STREAMING },
        { status: ChatConversationStatus.IDLE },
    )
    return { ...conversation, status: ChatConversationStatus.IDLE }
}

export const chatConversationService = (_log: FastifyBaseLogger) => ({
    async create({ platformId, userId, title, modelName }: CreateParams): Promise<ChatConversation> {
        const conversation: ChatConversation = {
            id: ibId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            platformId,
            projectId: null,
            userId,
            title: title ?? null,
            modelName: modelName ?? null,
            status: ChatConversationStatus.IDLE,
            messages: [],
            uiMessages: null,
            summary: null,
            summarizedUpToIndex: null,
        }
        return conversationRepo().save(conversation)
    },

    // List the caller's conversations on their platform, newest first, without the heavy blobs.
    async list({ platformId, userId }: Scope): Promise<SeekPage<ChatConversation>> {
        const conversations = await conversationRepo().find({
            where: { platformId, userId },
            select: [...LIST_SELECT],
            order: { created: 'DESC' },
        })
        return paginationHelper.createPage(conversations as ChatConversation[], null)
    },

    // Fetch a conversation the caller owns, recovering it from a crashed STREAMING state on read.
    async getOneOrThrow({ id, platformId, userId }: GetParams): Promise<ChatConversation> {
        const conversation = await conversationRepo().findOneBy({ id, platformId, userId })
        if (isNil(conversation)) {
            throw notFound(id)
        }
        return recoverIfStale(conversation)
    },

    async update({ id, platformId, userId, title, modelName }: UpdateParams): Promise<ChatConversation> {
        const conversation = await this.getOneOrThrow({ id, platformId, userId })
        await conversationRepo().update(
            { id: conversation.id, platformId, userId },
            {
                ...spreadIfDefined('title', title),
                ...spreadIfDefined('modelName', modelName),
            },
        )
        return this.getOneOrThrow({ id, platformId, userId })
    },

    async delete({ id, platformId, userId }: GetParams): Promise<void> {
        // Confirm ownership first so deleting a missing/out-of-scope conversation is a 404 rather
        // than a silent success.
        await this.getOneOrThrow({ id, platformId, userId })
        await conversationRepo().delete({ id, platformId, userId })
    },

    // The persisted UI message history for a conversation the caller owns.
    async getMessages({ id, platformId, userId }: GetParams): Promise<PersistedChatMessage[]> {
        const conversation = await this.getOneOrThrow({ id, platformId, userId })
        return conversation.uiMessages ?? []
    },

    // ---- Live-turn control-plane methods (H.2.c/H.2.d) ----------------------------------------

    // Claim the conversation for a new streaming turn. Fails if a turn is already live: only an
    // IDLE or ERROR conversation may start a turn (a STREAMING one is either genuinely running or
    // will be recovered to IDLE by the staleness check on the next read). The transition is a
    // conditional UPDATE so two concurrent sends cannot both win — exactly one flips the row to
    // STREAMING. Returns the conversation as it was before the flip (so the caller has the prior
    // messages/title) or throws if the claim was lost.
    async startTurnOrThrow({ id, platformId, userId }: GetParams): Promise<ChatConversation> {
        const conversation = await this.getOneOrThrow({ id, platformId, userId })
        if (conversation.status === ChatConversationStatus.STREAMING) {
            throw new IntellisperError({
                code: ErrorCode.VALIDATION,
                params: { message: 'A response is already being generated for this conversation.' },
            })
        }
        const result = await conversationRepo().update(
            { id, platformId, userId, status: conversation.status },
            { status: ChatConversationStatus.STREAMING },
        )
        if (result.affected === 0) {
            throw new IntellisperError({
                code: ErrorCode.VALIDATION,
                params: { message: 'A response is already being generated for this conversation.' },
            })
        }
        return conversation
    },

    // Worker-plane read: load a conversation by id alone (the worker authenticates as the platform
    // engine and addresses conversations by id). Returns null when absent.
    async getByIdUnscoped(id: string): Promise<ChatConversation | null> {
        return conversationRepo().findOneBy({ id })
    },

    // Worker-plane read that throws — used by the config assembler where a missing conversation is
    // a hard error.
    async getByIdUnscopedOrThrow(id: string): Promise<ChatConversation> {
        const conversation = await this.getByIdUnscoped(id)
        if (isNil(conversation)) {
            throw notFound(id)
        }
        return conversation
    },

    // Persist the model-message log and UI-message history for a live turn, and return the
    // conversation to IDLE (the turn produced a final result). Optionally records an auto-title and
    // the resolved model name. Worker-plane (id-addressed).
    async saveTurn({ id, messages, uiMessages, title, modelName, summary, summarizedUpToIndex }: SaveTurnParams): Promise<void> {
        await conversationRepo().update(
            { id },
            {
                messages: jsonbArray(messages),
                uiMessages: jsonbArray(uiMessages),
                status: ChatConversationStatus.IDLE,
                ...spreadIfDefined('title', title),
                ...spreadIfDefined('modelName', modelName),
                ...spreadIfDefined('summary', summary),
                ...spreadIfDefined('summarizedUpToIndex', summarizedUpToIndex),
            },
        )
    },

    // Heartbeat + streaming progress: update the rolling UI-message history mid-turn and bump
    // `updated` (which is what the staleness check reads). Keeps the conversation STREAMING.
    async updateProgress({ id, uiMessages }: { id: string, uiMessages: PersistedChatMessage[] }): Promise<void> {
        await conversationRepo().update({ id }, { uiMessages: jsonbArray(uiMessages), updated: new Date().toISOString() })
    },

    // Bind (or clear) the conversation's active project context, set by the agent's
    // ib_select_project / ib_deselect_project tools. Worker-plane (id-addressed).
    async setProjectContext({ id, projectId }: { id: string, projectId: string | null }): Promise<void> {
        await conversationRepo().update({ id }, { projectId })
    },

    // Mark a turn failed (surfaced to the client as a usable, retryable conversation).
    async markError(id: string): Promise<void> {
        await conversationRepo().update({ id }, { status: ChatConversationStatus.ERROR })
    },
})

type CreateParams = Scope & {
    title?: string | null
    modelName?: string | null
}

type GetParams = Scope & {
    id: string
}

type UpdateParams = GetParams & {
    title?: string | null
    modelName?: string | null
}

type SaveTurnParams = {
    id: string
    messages: Array<Record<string, unknown>>
    uiMessages: PersistedChatMessage[]
    title?: string
    modelName?: string
    summary?: string | null
    summarizedUpToIndex?: number | null
}
