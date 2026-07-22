// Clean-room implementation — chat metrics recorder (capability spec H.2.m, ingest half).
//
// The ONLY write path for chat analytics: a fire-and-forget insert of one `chat_message_metric`
// row per completed turn. NO outbound HTTP, no external SDK, no console secret — metrics live in a
// local table read only by the operator admin API. Called from the chat save path without being
// awaited into the response; every failure is caught and logged so a metric write can never slow or
// fail a turn. Gated by CHAT_METRICS_ENABLED (default on).
import { ChatConversation, ibId, isNil, PersistedChatPartType, tryCatch } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { aiProviderService } from '../../../ai/ai-provider-service'
import { repoFactory } from '../../../core/db/repo-factory'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { platformPlanService } from '../../platform/platform-plan/platform-plan.service'
import { ChatMessageMetric, ChatMessageMetricEntity } from './chat-message-metric.entity'
import { resolveMessages, resolveModelId } from './chat-telemetry-helpers'

const metricRepo = repoFactory(ChatMessageMetricEntity)

// Master switch — default ON when unset.
function isEnabled(): boolean {
    return system.getBoolean(AppSystemProp.CHAT_METRICS_ENABLED) !== false
}

// Rough turn sizing: total characters of the projected message text (user + assistant).
function computeMessageChars(conversation: ChatConversation): number {
    const messages = resolveMessages(conversation)
    let total = 0
    for (const message of messages) {
        for (const part of message.parts) {
            if (part.type === PersistedChatPartType.TEXT || part.type === PersistedChatPartType.REASONING) {
                total += part.text.length
            }
        }
    }
    return total
}

export const chatMetricsRecorder = (log: FastifyBaseLogger) => ({
    // Insert one metric row for a completed turn. Fully failure-isolated (never throws).
    async recordMessageMetric({ conversation, turnToolCount }: {
        conversation: ChatConversation
        turnToolCount: number
    }): Promise<void> {
        if (!isEnabled()) {
            return
        }
        const { error } = await tryCatch(async () => {
            // Provider name (no secret decryption) + concrete model id from the stored tier.
            const provider = await aiProviderService(log).getChatProviderName({ platformId: conversation.platformId })
            // `Nullable()` fields read as `T | null | undefined`; these contracts are `T | null`
            // and already treat null as "unset" (resolveModelId returns null for a nil tier).
            const model = resolveModelId({ tierId: conversation.modelName ?? null, provider })
            const plan = await platformPlanService(log).getOrCreateForPlatform(conversation.platformId)
            const licenseKey = plan.licenseKey ?? null

            const metric: ChatMessageMetric = {
                id: ibId(),
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                platformId: conversation.platformId,
                projectId: conversation.projectId ?? null,
                userId: conversation.userId,
                conversationId: conversation.id,
                provider: isNil(provider) ? null : String(provider),
                model,
                toolsUsed: turnToolCount,
                messageChars: computeMessageChars(conversation),
                licenseKey,
            }
            await metricRepo().save(metric)
        })
        if (error) {
            log.warn({ err: error, conversationId: conversation.id }, '[chatMetricsRecorder] recordMessageMetric failed (isolated)')
        }
    },
})
