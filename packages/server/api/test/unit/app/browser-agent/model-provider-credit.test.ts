import { ErrorCode, IntellisperError } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Facade credit-path tests: prove that in MANAGED mode an exhausted-credit provider error becomes a
 * TERMINAL, typed AI_CREDIT_LIMIT_EXCEEDED — surfaced without wasting retries or a fallback call —
 * and that a happy managed turn preserves the tiering/caching/billedTokens contract (still routes
 * through generateText, still stamps the anthropic cache breakpoint). The AI SDK + provider factories
 * are mocked; we assert on how the facade drives them.
 */

const { generateTextMock, resolveMock, getUsageMock, orModelMock } = vi.hoisted(() => ({
    generateTextMock: vi.fn(),
    resolveMock: vi.fn(),
    getUsageMock: vi.fn().mockResolvedValue({ usage: 1000, limit: 1000, usageMonthly: 1000, usageRemaining: 0 }),
    orModelMock: vi.fn((id: string) => ({ __model: id })),
}))

vi.mock('ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('ai')>()
    return { ...actual, generateText: generateTextMock }
})
vi.mock('@openrouter/ai-sdk-provider', () => ({
    createOpenRouter: () => orModelMock,
}))
// Native SDK factories (env mode) — return a model builder so env-mode buildModel doesn't do real IO.
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => (id: string) => ({ __anthropic: id }) }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: () => Object.assign((id: string) => ({ __openai: id }), { textEmbeddingModel: (id: string) => ({ __embed: id }) }) }))
vi.mock('../../../../src/app/browser-agent/model-provider/model-key-resolver', () => ({
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    browserAgentKeyResolver: () => ({ resolve: resolveMock }),
}))
vi.mock('../../../../src/app/enterprise/platform/platform-plan/platform-ai-credits.service', () => ({
    platformAiCreditsService: () => ({ getUsage: getUsageMock }),
}))
// Provide env keys so env-mode buildModel is exercised (not short-circuited by "key not configured").
vi.mock('../../../../src/app/browser-agent/model-provider/model-provider.config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../src/app/browser-agent/model-provider/model-provider.config')>()
    return {
        ...actual,
        browserAgentModelConfig: { ...actual.browserAgentModelConfig, anthropicApiKey: () => 'env-anthropic', openaiApiKey: () => 'env-openai' },
    }
})

import { browserAgentModelProvider } from '../../../../src/app/browser-agent/model-provider/model-provider.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

const MANAGED = { mode: 'managed' as const, apiKey: 'or-key', apiKeyHash: 'h', baseURL: 'https://openrouter.ai/api/v1' }

function okTurn() {
    return {
        text: 'done',
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 40, totalTokens: 150 },
        response: { messages: [] },
    }
}

beforeEach(() => {
    generateTextMock.mockReset()
    resolveMock.mockReset().mockResolvedValue(MANAGED)
    getUsageMock.mockReset().mockResolvedValue({ usage: 1000, limit: 1000, usageMonthly: 1000, usageRemaining: 0 })
    orModelMock.mockClear()
})

async function callOnce() {
    return browserAgentModelProvider(log, 'p1').callWithTools({ tier: 'default', system: 'sys', messages: [{ role: 'user', content: 'hi' }], tools: [] })
}

describe('MANAGED mode — happy path preserves the contract', () => {
    it('routes through the OpenRouter model, stamps the anthropic cache breakpoint, computes billedTokens', async () => {
        generateTextMock.mockResolvedValue(okTurn())
        const res = await callOnce()
        // Model built via the OpenRouter provider with a namespaced id (default tier = anthropic).
        expect(orModelMock).toHaveBeenCalledWith('anthropic/claude-haiku-4-5')
        // Cache breakpoint + usage accounting requested.
        const opts = generateTextMock.mock.calls[0][0]
        expect(opts.providerOptions.anthropic.cacheControl).toEqual({ type: 'ephemeral' })
        expect(opts.providerOptions.openrouter.usage).toEqual({ include: true })
        // billedTokens = uncached(60) + cached(40)*0.1 + output(50) = 114
        expect(res.usage.billedTokens).toBe(114)
        expect(res.isFinal).toBe(true)
    })
})

describe('MANAGED mode — credit exhaustion is terminal + typed', () => {
    it('maps a 402 to AI_CREDIT_LIMIT_EXCEEDED with usage/limit, WITHOUT retry or fallback', async () => {
        generateTextMock.mockRejectedValue(Object.assign(new Error('Insufficient credits'), { statusCode: 402 }))
        const err = await callOnce().then(() => null).catch((e) => e)
        expect(err).toBeInstanceOf(IntellisperError)
        expect((err as IntellisperError).error.code).toBe(ErrorCode.AI_CREDIT_LIMIT_EXCEEDED)
        expect((err as IntellisperError).error.params).toMatchObject({ usage: 1000, limit: 1000 })
        // Terminal: exactly ONE model attempt — no transient retries, no fallback-tier call.
        expect(generateTextMock).toHaveBeenCalledTimes(1)
    })

    it('a NON-credit transient error still retries + falls back (unchanged behavior — NOT terminated as credit)', async () => {
        generateTextMock.mockRejectedValue(Object.assign(new Error('overloaded 529'), { statusCode: 529 }))
        const err = await callOnce().then(() => null).catch((e) => e)
        // A transient error is retried (MAX_RETRIES) on the primary tier, then re-tried on the fallback
        // tier — MANY more attempts than the single, terminal credit-exhaustion path. And it is NOT a
        // credit error.
        expect(generateTextMock.mock.calls.length).toBeGreaterThan(1)
        expect(err instanceof IntellisperError && err.error.code === ErrorCode.AI_CREDIT_LIMIT_EXCEEDED).toBe(false)
    })
})

describe('ENV mode — 402 is NOT swallowed as a credit error', () => {
    it('an env-mode provider error propagates as-is (no managed credit mapping)', async () => {
        resolveMock.mockResolvedValue({ mode: 'env' })
        generateTextMock.mockRejectedValue(Object.assign(new Error('Insufficient credits'), { statusCode: 402 }))
        const err = await callOnce().then(() => null).catch((e) => e)
        // Not mapped to AI_CREDIT_LIMIT_EXCEEDED — env mode has no managed pool to exhaust.
        expect(err instanceof IntellisperError && err.error.code === ErrorCode.AI_CREDIT_LIMIT_EXCEEDED).toBe(false)
    })
})
