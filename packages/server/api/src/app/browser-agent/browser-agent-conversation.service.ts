import {
    type ConversationMessageView,
    type ConversationView,
    ErrorCode,
    IntellisperError,
    isNil,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { AgentConversationEntity, AgentMessageEntity } from './entities'
import { agentScope } from './scope/agent-scope'

const conversationRepo = repoFactory(AgentConversationEntity)
const messageRepo = repoFactory(AgentMessageEntity)

/** (platform, user) — the acting owner. Every conversation read is scoped to it via agentScope. */
export type ConversationScope = { userId: string, platformId: string }

type Paged = { page?: number, limit?: number }

function pageBounds(params: Paged, defaultLimit: number): { limit: number, offset: number } {
    const page = Math.max(1, params.page ?? 1)
    const limit = Math.max(1, Math.min(100, params.limit ?? defaultLimit))
    return { limit, offset: (page - 1) * limit }
}

export const browserAgentConversation = (_log: FastifyBaseLogger) => ({
    /**
     * List the acting user's non-deleted conversations (newest activity first), paginated. Owner-scoped
     * via agentScope.ownerFilter — a project member never sees another member's conversations.
     */
    async list(scope: ConversationScope, params: Paged): Promise<{ conversations: ConversationView[], total: number }> {
        const { limit, offset } = pageBounds(params, 20)
        const owner = agentScope.ownerFilter(scope)
        const qb = conversationRepo().createQueryBuilder('c')
            .where('c."platformId" = :platformId', { platformId: owner.platformId })
            .andWhere('c."userId" = :userId', { userId: owner.userId })
            .andWhere('c."deletedAt" IS NULL')
            .orderBy('c.updated', 'DESC')
        const total = await qb.getCount()
        const rows = await qb.skip(offset).take(limit).getMany()
        const conversations = rows.map((c) => ({
            id: c.id,
            title: c.title ?? null,
            createdAt: c.created,
            updatedAt: c.updated,
        }))
        return { conversations, total }
    },

    /**
     * List one conversation's messages (oldest first), paginated. The conversation's ownership is
     * verified FIRST through agentScope.ownerFilter; a missing/foreign/deleted conversation throws
     * ENTITY_NOT_FOUND (never leaks existence across the tenant boundary).
     */
    async messages(scope: ConversationScope, conversationId: string, params: Paged): Promise<{ messages: ConversationMessageView[], total: number }> {
        const conversation = await conversationRepo().findOneBy({ id: conversationId, ...agentScope.ownerFilter(scope), deletedAt: null } as never)
        if (isNil(conversation)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { message: 'Conversation not found', entityType: 'conversation', entityId: conversationId },
            })
        }

        const { limit, offset } = pageBounds(params, 50)
        // agentScope-exempt: parent conversation ownership already verified via agentScope.ownerFilter
        const qb = messageRepo().createQueryBuilder('m')
            .where('m."conversationId" = :cid', { cid: conversationId })
            .orderBy('m.created', 'ASC')
        const total = await qb.getCount()
        const rows = await qb.skip(offset).take(limit).getMany()
        const messages = rows.map((m) => ({
            id: m.id,
            conversationId: m.conversationId,
            role: m.role,
            content: m.content,
            toolCalls: (m.toolCalls ?? null) as ConversationMessageView['toolCalls'],
            createdAt: m.created,
        }))
        return { messages, total }
    },

    /**
     * Soft-delete a conversation (set deletedAt = now()). Strictly owner-scoped and idempotent: ok=true
     * only when a still-live row belonging to the acting user was updated.
     */
    async remove(scope: ConversationScope, conversationId: string): Promise<{ ok: boolean }> {
        const owner = agentScope.ownerFilter(scope)
        const res = await conversationRepo().update(
            { id: conversationId, platformId: owner.platformId, userId: owner.userId, deletedAt: null } as never,
            { deletedAt: new Date().toISOString() } as never,
        )
        return { ok: (res.affected ?? 0) > 0 }
    },
})
