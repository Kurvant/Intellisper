import {
    AIProviderName,
    ChatConversation,
    ChatConversationStatus,
    PersistedChatMessage,
    PersistedChatPartType,
    PersistedChatRole,
    PersistedToolCallStatus,
} from '@intelblocks/shared'
import { describe, expect, it } from 'vitest'
import {
    countToolCallsInLatestTurn,
    extractToolCallsSummary,
    resolveMessages,
    resolveModelId,
} from '../../../../src/app/enterprise/chat/telemetry/chat-telemetry-helpers'

function textMsg(role: PersistedChatRole, text: string): PersistedChatMessage {
    return { role, parts: [{ type: PersistedChatPartType.TEXT, text }] }
}

function toolMsg(role: PersistedChatRole, toolName: string, status: PersistedToolCallStatus): PersistedChatMessage {
    return {
        role,
        parts: [{
            type: PersistedChatPartType.TOOL_CALL,
            toolCallId: `tc-${toolName}-${status}`,
            toolName,
            input: {},
            status,
        }],
    }
}

function makeConversation(overrides: Partial<ChatConversation>): ChatConversation {
    return {
        id: 'c1',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:01:00.000Z',
        platformId: 'p1',
        projectId: null,
        userId: 'u1',
        title: null,
        modelName: null,
        status: ChatConversationStatus.IDLE,
        messages: [],
        uiMessages: null,
        summary: null,
        summarizedUpToIndex: null,
        ...overrides,
    }
}

describe('resolveModelId', () => {
    it('maps a known tier id to the provider concrete model id', () => {
        expect(resolveModelId({ tierId: 'smart', provider: AIProviderName.ANTHROPIC })).toBe('anthropic/claude-sonnet-4.6')
        expect(resolveModelId({ tierId: 'fast', provider: null })).toBe('anthropic/claude-haiku-4.5')
    })

    it('falls back to the tier id string for an unknown tier', () => {
        expect(resolveModelId({ tierId: 'gpt-4o', provider: AIProviderName.OPENAI })).toBe('gpt-4o')
    })

    it('returns null when tierId is null', () => {
        expect(resolveModelId({ tierId: null, provider: AIProviderName.ANTHROPIC })).toBeNull()
    })
})

describe('resolveMessages', () => {
    it('prefers persisted uiMessages when present and non-empty', () => {
        const uiMessages = [textMsg(PersistedChatRole.USER, 'hi')]
        const conversation = makeConversation({ uiMessages })
        expect(resolveMessages(conversation)).toBe(uiMessages)
    })

    it('reconstructs from raw history when uiMessages is absent', () => {
        const conversation = makeConversation({
            uiMessages: null,
            messages: [
                { role: 'user', content: 'hello' },
                { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] },
                { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't', result: 'x' }] },
            ],
        })
        const result = resolveMessages(conversation)
        expect(result).toHaveLength(2)
        expect(result[0].role).toBe(PersistedChatRole.USER)
        expect(result[0].parts[0]).toEqual({ type: PersistedChatPartType.TEXT, text: 'hello' })
        expect(result[1].role).toBe(PersistedChatRole.ASSISTANT)
        expect(result[1].parts[0]).toEqual({ type: PersistedChatPartType.TEXT, text: 'hi there' })
    })

    it('returns empty array when there is nothing to project', () => {
        expect(resolveMessages(makeConversation({ uiMessages: null, messages: [] }))).toEqual([])
    })
})

describe('extractToolCallsSummary', () => {
    it('aggregates success/failure counts per tool', () => {
        const messages = [
            textMsg(PersistedChatRole.USER, 'go'),
            toolMsg(PersistedChatRole.ASSISTANT, 'ap_execute_action', PersistedToolCallStatus.COMPLETED),
            toolMsg(PersistedChatRole.ASSISTANT, 'ap_execute_action', PersistedToolCallStatus.ERROR),
            toolMsg(PersistedChatRole.ASSISTANT, 'ap_list_flows', PersistedToolCallStatus.COMPLETED),
        ]
        const summary = extractToolCallsSummary(messages)
        expect(summary).toEqual(expect.arrayContaining([
            { name: 'ap_execute_action', successCount: 1, failureCount: 1 },
            { name: 'ap_list_flows', successCount: 1, failureCount: 0 },
        ]))
        expect(summary).toHaveLength(2)
    })

    it('returns null when there are no tool calls', () => {
        expect(extractToolCallsSummary([textMsg(PersistedChatRole.USER, 'hi')])).toBeNull()
        expect(extractToolCallsSummary([])).toBeNull()
    })
})

describe('countToolCallsInLatestTurn', () => {
    it('counts tool-call parts only from the last user message onward', () => {
        const messages = [
            textMsg(PersistedChatRole.USER, 'first'),
            toolMsg(PersistedChatRole.ASSISTANT, 't1', PersistedToolCallStatus.COMPLETED),
            textMsg(PersistedChatRole.USER, 'second'), // latest turn starts here
            toolMsg(PersistedChatRole.ASSISTANT, 't2', PersistedToolCallStatus.COMPLETED),
            toolMsg(PersistedChatRole.ASSISTANT, 't3', PersistedToolCallStatus.ERROR),
        ]
        expect(countToolCallsInLatestTurn(messages)).toBe(2)
    })

    it('counts across all messages when there is no user message', () => {
        const messages = [toolMsg(PersistedChatRole.ASSISTANT, 't1', PersistedToolCallStatus.COMPLETED)]
        expect(countToolCallsInLatestTurn(messages)).toBe(1)
    })

    it('returns 0 when the latest turn has no tool calls', () => {
        expect(countToolCallsInLatestTurn([textMsg(PersistedChatRole.USER, 'hi')])).toBe(0)
    })
})
