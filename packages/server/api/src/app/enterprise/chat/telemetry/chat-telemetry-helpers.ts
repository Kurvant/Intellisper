// Clean-room implementation — pure helpers for chat telemetry (capability spec H.2.m, section 2).
//
// All deterministic, no I/O: message projection, tier→model resolution, and tool-call aggregation.
// Lookup resolvers (user email, platform name, provider name) live in the module itself because they
// hit services; these helpers are the pure core the tests pin.
import {
    INTELLISPER_CHAT_TIERS,
    AIProviderName,
    ChatConversation,
    isNil,
    PersistedChatMessage,
    PersistedChatPartType,
    PersistedChatRole,
    PersistedToolCallStatus,
} from '@intelblocks/shared'

export type ToolCallSummaryEntry = {
    name: string
    successCount: number
    failureCount: number
}

// The UI-message projection for a conversation: prefer the persisted `uiMessages`; otherwise
// reconstruct a best-effort projection from the raw model-message history so a conversation synced
// before uiMessages existed still carries a usable message list.
export function resolveMessages(conversation: ChatConversation): PersistedChatMessage[] {
    if (!isNil(conversation.uiMessages) && conversation.uiMessages.length > 0) {
        return conversation.uiMessages
    }
    return reconstructFromRawHistory(conversation.messages ?? [])
}

// Reconstruct persisted-part-shaped messages from raw model messages. Only user/assistant text is
// recovered (tool-call parts aren't reliably present in the raw log); this is a projection for
// visibility, not a lossless round-trip.
function reconstructFromRawHistory(rawMessages: Array<Record<string, unknown>>): PersistedChatMessage[] {
    const result: PersistedChatMessage[] = []
    for (const raw of rawMessages) {
        const role = raw['role']
        if (role !== 'user' && role !== 'assistant') {
            continue
        }
        const text = extractRawText(raw['content'])
        if (isNil(text)) {
            continue
        }
        result.push({
            role: role === 'user' ? PersistedChatRole.USER : PersistedChatRole.ASSISTANT,
            parts: [{ type: PersistedChatPartType.TEXT, text }],
        })
    }
    return result
}

// Raw model-message content is either a string or an array of parts; recover its text.
function extractRawText(content: unknown): string | undefined {
    if (typeof content === 'string') {
        return content
    }
    if (!Array.isArray(content)) {
        return undefined
    }
    const texts = content
        .filter((part): part is Record<string, unknown> => typeof part === 'object' && part !== null)
        .filter((part) => part['type'] === 'text' && typeof part['text'] === 'string')
        .map((part) => part['text'] as string)
    return texts.length > 0 ? texts.join('\n') : undefined
}

// Map a stored tier id to the provider's concrete model id via the shared tier table; fall back to
// the tier id string itself when it isn't a known tier (e.g. a raw model name was stored).
export function resolveModelId({ tierId, provider: _provider }: { tierId: string | null, provider: AIProviderName | null }): string | null {
    if (isNil(tierId)) {
        return null
    }
    const tier = INTELLISPER_CHAT_TIERS.find((candidate) => candidate.id === tierId)
    return tier?.modelId ?? tierId
}

// Iterate every tool-call part across the message projection and aggregate per-tool success/failure
// counts. Returns null when there are no tool calls at all.
export function extractToolCallsSummary(messages: PersistedChatMessage[]): ToolCallSummaryEntry[] | null {
    const byName = new Map<string, ToolCallSummaryEntry>()
    for (const message of messages) {
        for (const part of message.parts) {
            if (part.type !== PersistedChatPartType.TOOL_CALL) {
                continue
            }
            const entry = byName.get(part.toolName) ?? { name: part.toolName, successCount: 0, failureCount: 0 }
            if (part.status === PersistedToolCallStatus.ERROR) {
                entry.failureCount += 1
            }
            else {
                entry.successCount += 1
            }
            byName.set(part.toolName, entry)
        }
    }
    return byName.size === 0 ? null : Array.from(byName.values())
}

// Count tool-call parts in the LATEST turn — the slice from the last user message onward. Used for
// the per-message billing `toolsUsed` property.
export function countToolCallsInLatestTurn(messages: PersistedChatMessage[]): number {
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === PersistedChatRole.USER) {
            lastUserIndex = i
            break
        }
    }
    const latestTurn = lastUserIndex >= 0 ? messages.slice(lastUserIndex) : messages
    let count = 0
    for (const message of latestTurn) {
        for (const part of message.parts) {
            if (part.type === PersistedChatPartType.TOOL_CALL) {
                count += 1
            }
        }
    }
    return count
}
