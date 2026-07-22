// Clean-room implementation — conversation history compaction (capability spec H.2.h).
//
// Long conversations must stay within the model's context window. Compaction keeps a rolling
// summary of older turns plus a recent verbatim window. This module is pure/deterministic (no
// DB, no model calls) so the control plane can decide *whether* to compact and *how* to assemble
// the payload sent to the model:
//
//   - estimateTokenCount : cheap char-based token estimate (~4 chars/token).
//   - shouldCompact      : true once the estimate crosses 70% of the provider's context window
//                          (and the conversation is long enough to be worth summarizing).
//   - buildCompactedPayload : prepend the summary and keep only the recent window, trimming
//                          further (oldest-first, never splitting a tool-call/tool-result pair)
//                          if the result still overflows — throwing if even a minimal payload
//                          cannot fit.
import { AIProviderName, aiProviderUtils, ErrorCode, IntellisperError } from '@intelblocks/shared'
import { ModelMessage } from 'ai'

// Rough token estimate: ~4 characters per token (matches common BPE tokenizers closely enough
// for a budgeting heuristic without pulling a real tokenizer into the control plane).
const CHARS_PER_TOKEN = 4

// Compact once the estimate reaches this fraction of the provider's context window, leaving
// headroom for the model's own response.
const COMPACTION_THRESHOLD_RATIO = 0.7

// Don't bother summarizing very short conversations — the overhead isn't worth it and there's
// little history to compress.
const MIN_MESSAGES_TO_COMPACT = 10

function estimateTokenCount({ messages, systemPromptLength }: {
    messages: ModelMessage[]
    systemPromptLength: number
}): number {
    const messagesChars = JSON.stringify(messages).length
    return Math.ceil(messagesChars / CHARS_PER_TOKEN) + Math.ceil(systemPromptLength / CHARS_PER_TOKEN)
}

function thresholdTokensFor(provider: AIProviderName): number {
    return aiProviderUtils.getMaxContextTokens({ provider }) * COMPACTION_THRESHOLD_RATIO
}

function shouldCompact({ estimatedTokens, provider, messageCount }: {
    estimatedTokens: number
    provider: AIProviderName
    messageCount: number
}): boolean {
    if (messageCount < MIN_MESSAGES_TO_COMPACT) {
        return false
    }
    return estimatedTokens > thresholdTokensFor(provider)
}

function buildSummaryMessage(summary: string): ModelMessage {
    return {
        role: 'user',
        content: `[Previous conversation summary]\n${summary}`,
    }
}

// A `tool` message is only meaningful when the assistant `tool-call` that produced it is also
// present. When we trim the recent window from the front we must not leave an orphaned tool
// result as the first kept message.
function isToolMessage(message: ModelMessage): boolean {
    return message.role === 'tool'
}

function payloadTokens(messages: ModelMessage[]): number {
    return estimateTokenCount({ messages, systemPromptLength: 0 })
}

// Drop a leading `tool` message (its originating `tool-call` was summarized away, so it would
// be orphaned). Applied whenever we advance the head of the recent window.
function stripLeadingToolMessage(recent: ModelMessage[]): ModelMessage[] {
    let result = recent
    while (result.length > 0 && isToolMessage(result[0])) {
        result = result.slice(1)
    }
    return result
}

function buildCompactedPayload({ messages, summary, summarizedUpToIndex, provider }: {
    messages: ModelMessage[]
    summary: string | null
    summarizedUpToIndex: number | null
    provider: AIProviderName
}): ModelMessage[] {
    // Nothing has been summarized yet — send history verbatim (identity, so callers can compare
    // by reference).
    if (summary === null || summarizedUpToIndex === null) {
        return messages
    }

    const threshold = thresholdTokensFor(provider)
    const summaryMessage = buildSummaryMessage(summary)

    // Recent verbatim window: everything from summarizedUpToIndex onward, with any orphaned
    // leading tool message removed.
    let recent = stripLeadingToolMessage(messages.slice(summarizedUpToIndex))

    // Trim oldest-first until the payload fits, but never drop the final (most recent) message:
    // that message is the user's latest turn and must always be present. If even
    // summary + last-message overflows, no viable payload exists.
    while (recent.length > 1) {
        const candidate = [summaryMessage, ...recent]
        if (payloadTokens(candidate) <= threshold) {
            return candidate
        }
        recent = stripLeadingToolMessage(recent.slice(1))
    }

    const minimalPayload = [summaryMessage, ...recent]
    if (payloadTokens(minimalPayload) <= threshold) {
        return minimalPayload
    }

    throw new IntellisperError({
        code: ErrorCode.CHAT_CONTEXT_LIMIT_EXCEEDED,
        params: {},
    })
}

export const chatCompaction = {
    estimateTokenCount,
    shouldCompact,
    buildCompactedPayload,
}
