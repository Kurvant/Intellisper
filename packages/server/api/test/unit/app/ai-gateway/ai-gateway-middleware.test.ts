import { meterEmbeddingModel, meterLanguageModel } from '@intelblocks/server-utils'
import { AiFeature, AiKeyMode, AiModality, type ReportAiUsageRequest } from '@intelblocks/shared'
import { embedMany, generateText, streamText } from 'ai'
import { MockEmbeddingModelV3, MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'

/**
 * The interception layer. These tests prove the two guarantees the whole design rests on:
 *   1. we capture real usage (and the provider's own cost) on BOTH generate and stream, and
 *   2. metering can never break, delay, or alter the AI call it observes.
 */

const context = {
    platformId: 'plat1',
    projectId: 'proj1',
    userId: 'user1',
    feature: AiFeature.BROWSER_AGENT,
    featureRef: 'run1',
    keyMode: AiKeyMode.MANAGED,
    idempotencyPrefix: 'run1',
}

describe('meterLanguageModel — generate', () => {
    it('captures normalized tokens and attributes them to the model that ACTUALLY ran', async () => {
        const emitted: ReportAiUsageRequest[] = []
        // Anthropic-shaped usage: total INCLUDES the cache tokens.
        const model = new MockLanguageModelV3({
            provider: 'anthropic',
            modelId: 'claude-haiku-4-5',
            doGenerate: async () => ({
                content: [{ type: 'text', text: 'ok' }],
                finishReason: 'stop' as const,
                warnings: [],
                usage: {
                    inputTokens: { total: 1250, noCache: 200, cacheRead: 1000, cacheWrite: 50 },
                    outputTokens: { total: 300, text: 300, reasoning: undefined },
                },
                response: { id: 'req_abc' },
            }),
        })

        const metered = meterLanguageModel({ model, context, emit: (c) => emitted.push(c) })
        const result = await generateText({ model: metered, prompt: 'hi' })

        // The call itself is untouched.
        expect(result.text).toBe('ok')

        expect(emitted).toHaveLength(1)
        const call = emitted[0]
        // Fresh input only — NOT the 1250 total. Billing the total would double-charge the 1050
        // cached tokens, on every single turn of an agent that caches on every turn.
        expect(call.tokens.inputTokens).toBe(200)
        expect(call.tokens.cacheReadTokens).toBe(1000)
        expect(call.tokens.cacheWriteTokens).toBe(50)
        expect(call.tokens.outputTokens).toBe(300)
        expect(call.provider).toBe('anthropic')
        expect(call.model).toBe('claude-haiku-4-5')
        expect(call.modality).toBe(AiModality.TEXT)
        expect(call.requestId).toBe('req_abc')
        expect(call.idempotencyKey).toBe('run1:1')
    })

    it('lifts OpenRouter\'s OWN USD cost out of providerMetadata (the authoritative number)', async () => {
        const emitted: ReportAiUsageRequest[] = []
        const model = new MockLanguageModelV3({
            provider: 'openrouter',
            modelId: 'anthropic/claude-haiku-4-5',
            doGenerate: async () => ({
                content: [{ type: 'text', text: 'ok' }],
                finishReason: 'stop' as const,
                warnings: [],
                usage: { inputTokens: { total: 100, noCache: 100 }, outputTokens: { total: 50 } },
                providerMetadata: { openrouter: { usage: { cost: 0.00427 } } },
            }),
        })

        const metered = meterLanguageModel({ model, context, emit: (c) => emitted.push(c) })
        await generateText({ model: metered, prompt: 'hi' })

        // We get the vendor's real charge for free, on a response we were already awaiting —
        // no extra request, no proxy, no latency.
        expect(emitted[0].providerCostUsd).toBe(0.00427)
    })

    it('gives each call in a run a DISTINCT, STABLE key (so a retry is a no-op, not a double charge)', async () => {
        const emitted: ReportAiUsageRequest[] = []
        const model = new MockLanguageModelV3({
            provider: 'anthropic',
            modelId: 'claude-haiku-4-5',
            doGenerate: async () => ({
                content: [{ type: 'text', text: 'ok' }],
                finishReason: 'stop' as const,
                warnings: [],
                usage: { inputTokens: { total: 10, noCache: 10 }, outputTokens: { total: 5 } },
            }),
        })
        const metered = meterLanguageModel({ model, context, emit: (c) => emitted.push(c) })

        await generateText({ model: metered, prompt: 'a' })
        await generateText({ model: metered, prompt: 'b' })

        expect(emitted.map((e) => e.idempotencyKey)).toEqual(['run1:1', 'run1:2'])
    })
})

describe('meterLanguageModel — stream', () => {
    it('captures usage from the terminal finish part WITHOUT altering the stream', async () => {
        const emitted: ReportAiUsageRequest[] = []
        const model = new MockLanguageModelV3({
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-5',
            doStream: async () => ({
                stream: simulateReadableStream({
                    chunks: [
                        { type: 'text-start', id: '1' },
                        { type: 'text-delta', id: '1', delta: 'Hello' },
                        { type: 'text-delta', id: '1', delta: ' world' },
                        { type: 'text-end', id: '1' },
                        {
                            type: 'finish',
                            finishReason: 'stop',
                            usage: {
                                inputTokens: { total: 900, noCache: 100, cacheRead: 800, cacheWrite: 0 },
                                outputTokens: { total: 42, text: 42 },
                            },
                            providerMetadata: { openrouter: { usage: { cost: 0.002 } } },
                        },
                    ] as never,
                }),
            }),
        })

        const metered = meterLanguageModel({ model, context, emit: (c) => emitted.push(c) })
        const result = streamText({ model: metered, prompt: 'hi' })

        // Every token still reaches the user, unchanged and in order — the middleware only observes.
        let text = ''
        for await (const chunk of result.textStream) {
            text += chunk
        }
        expect(text).toBe('Hello world')

        expect(emitted).toHaveLength(1)
        expect(emitted[0].tokens.inputTokens).toBe(100)
        expect(emitted[0].tokens.cacheReadTokens).toBe(800)
        expect(emitted[0].tokens.outputTokens).toBe(42)
        expect(emitted[0].providerCostUsd).toBe(0.002)
    })
})

describe('meterLanguageModel — metering can NEVER break the AI call', () => {
    it('a throwing emitter does not fail generateText', async () => {
        const onError = vi.fn()
        const model = new MockLanguageModelV3({
            provider: 'anthropic',
            modelId: 'claude-haiku-4-5',
            doGenerate: async () => ({
                content: [{ type: 'text', text: 'still works' }],
                finishReason: 'stop' as const,
                warnings: [],
                usage: { inputTokens: { total: 10, noCache: 10 }, outputTokens: { total: 5 } },
            }),
        })

        const metered = meterLanguageModel({
            model,
            context,
            emit: () => {
                throw new Error('ledger exploded') 
            },
            onError,
        })

        // The user still gets their completion. This is the entire contract: telemetry that can break
        // the product it observes is worse than no telemetry.
        const result = await generateText({ model: metered, prompt: 'hi' })
        expect(result.text).toBe('still works')
        expect(onError).toHaveBeenCalled()
    })

    it('a throwing emitter does not corrupt or truncate a stream', async () => {
        const onError = vi.fn()
        const model = new MockLanguageModelV3({
            provider: 'anthropic',
            modelId: 'claude-haiku-4-5',
            doStream: async () => ({
                stream: simulateReadableStream({
                    chunks: [
                        { type: 'text-start', id: '1' },
                        { type: 'text-delta', id: '1', delta: 'all' },
                        { type: 'text-delta', id: '1', delta: ' good' },
                        { type: 'text-end', id: '1' },
                        {
                            type: 'finish',
                            finishReason: 'stop',
                            usage: { inputTokens: { total: 1, noCache: 1 }, outputTokens: { total: 1 } },
                        },
                    ] as never,
                }),
            }),
        })

        const metered = meterLanguageModel({
            model,
            context,
            emit: () => {
                throw new Error('ledger exploded') 
            },
            onError,
        })

        let text = ''
        for await (const chunk of streamText({ model: metered, prompt: 'hi' }).textStream) {
            text += chunk
        }
        expect(text).toBe('all good')
        expect(onError).toHaveBeenCalled()
    })
})

describe('meterEmbeddingModel', () => {
    it('meters embeddings (input tokens only) — previously invisible spend', async () => {
        const emitted: ReportAiUsageRequest[] = []
        const model = new MockEmbeddingModelV3<string>({
            provider: 'openai',
            modelId: 'text-embedding-3-small',
            doEmbed: async () => ({
                embeddings: [[0.1, 0.2]],
                usage: { tokens: 1500 },
                warnings: [],
            }),
        })

        const metered = meterEmbeddingModel({
            model,
            context: { ...context, feature: AiFeature.BROWSER_AGENT },
            emit: (c) => emitted.push(c),
        })
        await embedMany({ model: metered, values: ['hello'] })

        expect(emitted).toHaveLength(1)
        expect(emitted[0].modality).toBe(AiModality.EMBEDDING)
        expect(emitted[0].tokens.inputTokens).toBe(1500)
        // Embeddings have no output and no cache — those must be zero, not undefined/NaN.
        expect(emitted[0].tokens.outputTokens).toBe(0)
        expect(emitted[0].tokens.cacheReadTokens).toBe(0)
        expect(emitted[0].idempotencyKey).toBe('run1:e1')
    })
})
