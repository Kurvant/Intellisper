// Clean-room implementation — internal-admin chat analytics reads (capability spec H.2.m).
//
// Operator-scoped, cross-organization aggregation over the local chat_message_metric table plus
// live reads of chat_conversation. No outbound HTTP; no secret material is ever returned (provider
// and model are names only; connection values / provider keys / raw auth are never touched). Usage
// and by-org views aggregate the metric table; conversation views read chat_conversation directly
// (no snapshot table); the rollout funnel is read live from the rollout service.
import { ChatConversation, isNil, PersistedChatMessage } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { SelectQueryBuilder } from 'typeorm'
import { repoFactory } from '../../../../core/db/repo-factory'
import { PlatformEntity } from '../../../../platform/platform.entity'
import { ChatConversationEntity } from '../../../chat/chat-conversation-entity'
import { chatRolloutService, FunnelSnapshot } from '../../../chat/chat-rollout.service'
import { ChatMessageMetricEntity } from '../../../chat/telemetry/chat-message-metric.entity'

const metricRepo = repoFactory(ChatMessageMetricEntity)
const conversationRepo = repoFactory(ChatConversationEntity)
const platformRepo = repoFactory(PlatformEntity)

export type UsageGroupBy = 'day' | 'platform' | 'provider' | 'model'

export type UsageSummary = {
    totalMessages: number
    totalToolCalls: number
    distinctUsers: number
    distinctConversations: number
    series: Array<{ key: string, messages: number, toolCalls: number, users: number }>
}

export type OrgUsageRow = {
    platformId: string
    platformName: string | null
    licenseKey: string | null
    messages: number
    toolCalls: number
    distinctUsers: number
    lastActivityAt: string | null
}

export type ConversationListItem = {
    id: string
    platformId: string
    userId: string
    title: string | null
    modelName: string | null
    status: string
    messageCount: number
    created: string
    updated: string
}

export type ConversationDetail = ConversationListItem & {
    projectId: string | null
    messages: PersistedChatMessage[]
}

type Range = { from: string, to: string }

// The metric column a group bucket maps to.
const GROUP_COLUMN: Record<UsageGroupBy, string> = {
    day: 'to_char(date_trunc(\'day\', metric.created), \'YYYY-MM-DD\')',
    platform: 'metric."platformId"',
    provider: 'COALESCE(metric.provider, \'unknown\')',
    model: 'COALESCE(metric.model, \'unknown\')',
}

function messageCountOf(conversation: ChatConversation): number {
    return conversation.uiMessages?.length ?? 0
}

function toListItem(conversation: ChatConversation): ConversationListItem {
    return {
        id: conversation.id,
        platformId: conversation.platformId,
        userId: conversation.userId,
        title: conversation.title,
        modelName: conversation.modelName,
        status: conversation.status,
        messageCount: messageCountOf(conversation),
        created: conversation.created,
        updated: conversation.updated,
    }
}

export const chatAnalyticsService = (log: FastifyBaseLogger) => ({
    // Usage/billing summary over the metric table for [from,to], optionally one platform, grouped by
    // the requested bucket.
    async usage({ from, to, platformId, groupBy }: Range & { platformId?: string, groupBy: UsageGroupBy }): Promise<UsageSummary> {
        const applyFilters = (qb: SelectQueryBuilder<unknown>): SelectQueryBuilder<unknown> => {
            qb.where('metric.created >= :from', { from })
                .andWhere('metric.created <= :to', { to })
            if (!isNil(platformId)) {
                qb.andWhere('metric."platformId" = :platformId', { platformId })
            }
            return qb
        }

        // Totals.
        const totalsRow = await applyFilters(metricRepo().createQueryBuilder('metric'))
            .select('COUNT(metric.id)', 'messages')
            .addSelect('COALESCE(SUM(metric."toolsUsed"), 0)', 'toolcalls')
            .addSelect('COUNT(DISTINCT metric."userId")', 'users')
            .addSelect('COUNT(DISTINCT metric."conversationId")', 'conversations')
            .getRawOne<{ messages: string, toolcalls: string, users: string, conversations: string }>()

        // Series by bucket.
        const groupExpr = GROUP_COLUMN[groupBy]
        const seriesRows = await applyFilters(metricRepo().createQueryBuilder('metric'))
            .select(`${groupExpr}`, 'key')
            .addSelect('COUNT(metric.id)', 'messages')
            .addSelect('COALESCE(SUM(metric."toolsUsed"), 0)', 'toolcalls')
            .addSelect('COUNT(DISTINCT metric."userId")', 'users')
            .groupBy('key')
            .orderBy('key', 'ASC')
            .getRawMany<{ key: string, messages: string, toolcalls: string, users: string }>()

        return {
            totalMessages: Number(totalsRow?.messages ?? 0),
            totalToolCalls: Number(totalsRow?.toolcalls ?? 0),
            distinctUsers: Number(totalsRow?.users ?? 0),
            distinctConversations: Number(totalsRow?.conversations ?? 0),
            series: seriesRows.map((row) => ({
                key: row.key,
                messages: Number(row.messages),
                toolCalls: Number(row.toolcalls),
                users: Number(row.users),
            })),
        }
    },

    // Per-organization rollup, sorted by messages desc, offset-paginated. Platform name/license are
    // joined in from the platform + latest metric's license key.
    async byOrg({ from, to, offset, limit }: Range & { offset: number, limit: number }): Promise<{ data: OrgUsageRow[], total: number }> {
        const baseRows = await metricRepo().createQueryBuilder('metric')
            .select('metric."platformId"', 'platformId')
            .addSelect('COUNT(metric.id)', 'messages')
            .addSelect('COALESCE(SUM(metric."toolsUsed"), 0)', 'toolcalls')
            .addSelect('COUNT(DISTINCT metric."userId")', 'users')
            .addSelect('MAX(metric.created)', 'lastactivity')
            .where('metric.created >= :from', { from })
            .andWhere('metric.created <= :to', { to })
            .groupBy('metric."platformId"')
            .orderBy('messages', 'DESC')
            .getRawMany<{ platformId: string, messages: string, toolcalls: string, users: string, lastactivity: string }>()

        const total = baseRows.length
        const page = baseRows.slice(offset, offset + limit)
        if (page.length === 0) {
            return { data: [], total }
        }

        const platformIds = page.map((row) => row.platformId)
        const platforms = await platformRepo().createQueryBuilder('platform')
            .select(['platform.id AS "id"', 'platform.name AS "name"'])
            .where('platform.id IN (:...platformIds)', { platformIds })
            .getRawMany<{ id: string, name: string }>()
        const nameById = new Map(platforms.map((platform) => [platform.id, platform.name]))

        // Most recent license key seen for each platform in-range (nullable).
        const licenseRows = await metricRepo().createQueryBuilder('metric')
            .select('metric."platformId"', 'platformId')
            .addSelect('metric."licenseKey"', 'licenseKey')
            .addSelect('metric.created', 'created')
            .where('metric."platformId" IN (:...platformIds)', { platformIds })
            .andWhere('metric."licenseKey" IS NOT NULL')
            .orderBy('metric.created', 'DESC')
            .getRawMany<{ platformId: string, licenseKey: string, created: string }>()
        const licenseById = new Map<string, string>()
        for (const row of licenseRows) {
            if (!licenseById.has(row.platformId)) {
                licenseById.set(row.platformId, row.licenseKey)
            }
        }

        return {
            data: page.map((row) => ({
                platformId: row.platformId,
                platformName: nameById.get(row.platformId) ?? null,
                licenseKey: licenseById.get(row.platformId) ?? null,
                messages: Number(row.messages),
                toolCalls: Number(row.toolcalls),
                distinctUsers: Number(row.users),
                lastActivityAt: row.lastactivity ?? null,
            })),
            total,
        }
    },

    // Recent conversations (ops view) read live from chat_conversation. NO message bodies — metadata
    // + messageCount only. Offset-paginated, newest first.
    async conversations({ platformId, userId, offset, limit }: {
        platformId?: string
        userId?: string
        offset: number
        limit: number
    }): Promise<{ data: ConversationListItem[], total: number }> {
        const qb = conversationRepo().createQueryBuilder('conversation')
        if (!isNil(platformId)) {
            qb.andWhere('conversation."platformId" = :platformId', { platformId })
        }
        if (!isNil(userId)) {
            qb.andWhere('conversation."userId" = :userId', { userId })
        }
        const total = await qb.getCount()
        const rows = await qb
            .orderBy('conversation.created', 'DESC')
            .addOrderBy('conversation.id', 'DESC')
            .skip(offset)
            .take(limit)
            .getMany()
        return { data: rows.map(toListItem), total }
    },

    // Single conversation detail (ops/debug): metadata + the UI-message projection. Returns null
    // when the conversation does not exist. The controller logs the access.
    async conversationDetail(id: string): Promise<ConversationDetail | null> {
        const conversation = await conversationRepo().findOneBy({ id })
        if (isNil(conversation)) {
            return null
        }
        return {
            ...toListItem(conversation),
            projectId: conversation.projectId,
            messages: conversation.uiMessages ?? [],
        }
    },

    // Live rollout funnel snapshot.
    async rolloutFunnel(): Promise<FunnelSnapshot> {
        return chatRolloutService(log).getFunnelSnapshot()
    },
})
