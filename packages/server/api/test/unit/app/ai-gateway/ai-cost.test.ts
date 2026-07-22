import {
    AiCostSource,
    aiPricing,
    computeCallCost,
    creditsToUsd,
    extractProviderCostUsd,
    findModelPrice,
    normalizeModelId,
    normalizeUsage,
    usdToCredits,
} from '@intelblocks/shared'
import { describe, expect, it } from 'vitest'

/**
 * The money math. These tests exist because a WRONG number here is worse than no number: it would be
 * a confident, plausible figure that we would then set prices against. Each block pins one way the
 * arithmetic could silently lie.
 */

describe('normalizeUsage — the provider-semantics double-count trap', () => {
    /**
     * THE bug this whole layer exists to prevent.
     *
     * Anthropic reports inputTokens.total = noCache + cacheRead + cacheWrite. If we billed the total
     * AND the cache components, every cached token would be charged twice — and the browser agent
     * writes a cache breakpoint on EVERY turn, so the error would land squarely on our largest AI cost.
     */
    it('ANTHROPIC: total includes cache — fresh input is NOT double-counted', () => {
        // A real Anthropic turn: 200 fresh + 1000 read from cache + 50 written to cache.
        // The SDK reports total = 1250 (it INCLUDES the cache), and noCache = 200.
        const t = normalizeUsage({
            inputTokens: 1250,
            outputTokens: 300,
            inputTokenDetails: { noCacheTokens: 200, cacheReadTokens: 1000, cacheWriteTokens: 50 },
        })

        // We must bill 200 fresh input — NOT 1250.
        expect(t.inputTokens).toBe(200)
        expect(t.cacheReadTokens).toBe(1000)
        expect(t.cacheWriteTokens).toBe(50)
        expect(t.outputTokens).toBe(300)
        // The components are disjoint: they sum back to the provider's total exactly once.
        expect(t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens).toBe(1250)
    })

    it('OPENAI: cacheRead is a SUBSET of total — the same code gives the right answer', () => {
        // OpenAI reports total = prompt_tokens = 1000, of which 800 were cache hits. No cache writes.
        const t = normalizeUsage({
            inputTokens: 1000,
            outputTokens: 120,
            inputTokenDetails: { noCacheTokens: 200, cacheReadTokens: 800, cacheWriteTokens: undefined },
        })
        expect(t.inputTokens).toBe(200)
        expect(t.cacheReadTokens).toBe(800)
        expect(t.cacheWriteTokens).toBe(0)
        expect(t.inputTokens + t.cacheReadTokens).toBe(1000)
    })

    it('derives fresh input safely when the SDK omits noCacheTokens (both semantics, one expression)', () => {
        // Anthropic-shaped, no explicit noCache: total(1250) - read(1000) - write(50) = 200. Correct.
        expect(normalizeUsage({
            inputTokens: 1250,
            inputTokenDetails: { cacheReadTokens: 1000, cacheWriteTokens: 50 },
        }).inputTokens).toBe(200)

        // OpenAI-shaped, no explicit noCache: total(1000) - read(800) - write(0) = 200. Also correct.
        expect(normalizeUsage({
            inputTokens: 1000,
            inputTokenDetails: { cacheReadTokens: 800 },
        }).inputTokens).toBe(200)
    })

    it('never goes negative, even if a provider reports a total that excludes its own cache', () => {
        // Defensive: a hypothetical provider whose total is already net of cache would drive the
        // subtraction negative. Clamped at 0 — a negative token count would poison every aggregate.
        const t = normalizeUsage({ inputTokens: 100, inputTokenDetails: { cacheReadTokens: 900 } })
        expect(t.inputTokens).toBe(0)
        expect(t.cacheReadTokens).toBe(900)
    })

    it('falls back to the SDK-deprecated fields rather than losing the tokens', () => {
        const t = normalizeUsage({ inputTokens: 500, outputTokens: 10, cachedInputTokens: 400, reasoningTokens: 7 })
        expect(t.cacheReadTokens).toBe(400)
        expect(t.inputTokens).toBe(100)
        expect(t.reasoningTokens).toBe(7)
    })

    /**
     * REGRESSION. The SDK reports usage in TWO shapes: the flat, user-facing one
     * (`inputTokens: number` + `inputTokenDetails`) and the NESTED provider-level one
     * (`inputTokens: { total, noCache, cacheRead, cacheWrite }`) — and our gateway intercepts at the
     * middleware layer, where the NESTED shape is what actually arrives.
     *
     * Reading only the flat shape coerced every nested payload to ZERO tokens: a ledger full of $0.00
     * rows and phantom 100% margin on real spend. Worse, it was near-invisible, because OpenRouter
     * calls still looked right (their cost comes from providerMetadata, not from usage) while every
     * direct-vendor call silently read as free.
     */
    it('NESTED (provider/middleware) shape — the shape our interceptor actually sees', () => {
        const t = normalizeUsage({
            inputTokens: { total: 1250, noCache: 200, cacheRead: 1000, cacheWrite: 50 },
            outputTokens: { total: 300, text: 280, reasoning: 20 },
        } as never)
        expect(t.inputTokens).toBe(200)
        expect(t.cacheReadTokens).toBe(1000)
        expect(t.cacheWriteTokens).toBe(50)
        expect(t.outputTokens).toBe(300)
        expect(t.reasoningTokens).toBe(20)
    })

    it('NESTED shape without an explicit noCache still derives fresh input correctly', () => {
        const t = normalizeUsage({
            inputTokens: { total: 900, cacheRead: 800 },
            outputTokens: { total: 42 },
        } as never)
        expect(t.inputTokens).toBe(100)
        expect(t.cacheReadTokens).toBe(800)
        expect(t.outputTokens).toBe(42)
    })

    it('treats missing/garbage usage as zero rather than NaN (NaN would poison every SUM)', () => {
        expect(normalizeUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 })
        const t = normalizeUsage({ inputTokens: NaN, outputTokens: -5, inputTokenDetails: { cacheReadTokens: Infinity } })
        expect(t.inputTokens).toBe(0)
        expect(t.outputTokens).toBe(0)
        expect(t.cacheReadTokens).toBe(0)
    })
})

describe('computeCallCost — the provider is the source of truth', () => {
    const tokens = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }

    it('takes the provider\'s reported cost VERBATIM and does not consult the price table', () => {
        const r = computeCallCost({ provider: 'openrouter', model: 'anthropic/claude-haiku-4-5', tokens, providerCostUsd: 0.00427 })
        expect(r.costUsd).toBe(0.00427)
        expect(r.costSource).toBe(AiCostSource.PROVIDER)
        // No table was consulted, so no version is stamped — the number needs no version to be reproducible.
        expect(r.priceVersion).toBeNull()
    })

    it('accepts a genuine ZERO from the provider (a fully-cached call really can be free)', () => {
        const r = computeCallCost({ provider: 'openrouter', model: 'anthropic/claude-haiku-4-5', tokens, providerCostUsd: 0 })
        expect(r.costUsd).toBe(0)
        expect(r.costSource).toBe(AiCostSource.PROVIDER)
    })

    it('REJECTS a corrupt provider cost and falls back to computing (NaN/negative would poison aggregates)', () => {
        for (const bad of [NaN, -1, Infinity]) {
            const r = computeCallCost({ provider: 'anthropic', model: 'claude-haiku-4-5', tokens, providerCostUsd: bad })
            expect(r.costSource).toBe(AiCostSource.COMPUTED)
            expect(Number.isFinite(r.costUsd)).toBe(true)
        }
    })

    it('computes from the table when the provider reports no cost', () => {
        // Haiku: input $1.00/Mtok, output $5.00/Mtok → 1000×1e-6 + 500×5e-6 = 0.001 + 0.0025
        const r = computeCallCost({ provider: 'anthropic', model: 'claude-haiku-4-5', tokens })
        expect(r.costUsd).toBeCloseTo(0.0035, 10)
        expect(r.costSource).toBe(AiCostSource.COMPUTED)
        expect(r.priceVersion).toBe(aiPricing.version)
    })
})

describe('computeCallCost — cache WRITES are a premium, not a discount', () => {
    /**
     * The originating spec said to apply "a 90% cost reduction on cached_tokens". That is true of
     * cache READS only. Anthropic charges a 25% PREMIUM to WRITE a cache entry. Applying a discount
     * to writes would have systematically under-reported the browser agent, which writes on every turn.
     */
    it('bills a cache WRITE at 1.25x input, not 0.1x', () => {
        const write = computeCallCost({
            provider: 'anthropic', model: 'claude-haiku-4-5',
            tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000, reasoningTokens: 0 },
        })
        // 1M cache-write tokens at $1.25/Mtok.
        expect(write.costUsd).toBeCloseTo(1.25, 8)

        const plainInput = computeCallCost({
            provider: 'anthropic', model: 'claude-haiku-4-5',
            tokens: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
        })
        // The write MUST cost MORE than the same volume of plain input. The spec's flat discount
        // would have made it cost 8x LESS.
        expect(write.costUsd).toBeGreaterThan(plainInput.costUsd)
        expect(write.costUsd / plainInput.costUsd).toBeCloseTo(1.25, 6)
    })

    it('bills a cache READ at 0.1x input — the only genuinely discounted class', () => {
        const read = computeCallCost({
            provider: 'anthropic', model: 'claude-haiku-4-5',
            tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, reasoningTokens: 0 },
        })
        expect(read.costUsd).toBeCloseTo(0.10, 8)
    })

    it('prices a REAL browser-agent turn (fresh + read + write + output) correctly', () => {
        // 200 fresh, 1000 cache-read, 50 cache-write, 300 output — Haiku.
        // 200(1.00) + 1000(0.10) + 50(1.25) + 300(5.00), all /1e6
        // = 200e-6 + 100e-6 + 62.5e-6 + 1500e-6 = 0.0018625
        const r = computeCallCost({
            provider: 'anthropic', model: 'claude-haiku-4-5',
            tokens: { inputTokens: 200, outputTokens: 300, cacheReadTokens: 1000, cacheWriteTokens: 50, reasoningTokens: 0 },
        })
        expect(r.costUsd).toBeCloseTo(0.0018625, 12)
    })

    it('OpenAI has no separate cache-write charge — those tokens bill as ordinary input', () => {
        // cacheWritePerMTok is null for OpenAI, so a write falls back to the input rate (never cheaper).
        const r = computeCallCost({
            provider: 'openai', model: 'gpt-4o',
            tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000, reasoningTokens: 0 },
        })
        expect(r.costUsd).toBeCloseTo(2.50, 8) // = the input rate, not a discount
    })
})

describe('computeCallCost — an unknown model is a VISIBLE hole, never a silent zero', () => {
    it('marks an unpriced model as UNPRICED with zero cost (never guesses a rate)', () => {
        const r = computeCallCost({
            provider: 'anthropic', model: 'claude-model-we-have-never-heard-of',
            tokens: { inputTokens: 10_000, outputTokens: 5_000, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
        })
        expect(r.costSource).toBe(AiCostSource.UNPRICED)
        expect(r.costUsd).toBe(0)
        expect(r.priceVersion).toBeNull()
        // The point: the tokens are still recorded by the caller, so this surfaces in the dashboard as
        // unpriced VOLUME. A silent 0 folded into a margin is how a pricing model becomes a loss.
    })
})

describe('normalizeModelId + findModelPrice', () => {
    it('resolves the same product across OpenRouter namespacing, dated snapshots and routing suffixes', () => {
        expect(normalizeModelId('anthropic/claude-haiku-4-5')).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' })
        expect(normalizeModelId('claude-haiku-4-5-20251001')).toEqual({ provider: undefined, model: 'claude-haiku-4-5' })
        expect(normalizeModelId('openai/gpt-4o:floor')).toEqual({ provider: 'openai', model: 'gpt-4o' })
    })

    it('prices an OpenRouter-routed model off the MODEL\'s vendor, not the transport', () => {
        // Reached via openrouter, but it is an Anthropic model at Anthropic's price.
        const p = findModelPrice('openrouter', 'anthropic/claude-haiku-4-5')
        expect(p?.provider).toBe('anthropic')
        expect(p?.inputPerMTok).toBe(1.00)
    })

    it('honours effective dating — a rate is never in force before its start date', () => {
        expect(findModelPrice('anthropic', 'claude-haiku-4-5', new Date('2025-06-01'))).toBeNull()
        expect(findModelPrice('anthropic', 'claude-haiku-4-5', new Date('2026-07-14'))).not.toBeNull()
    })
})

describe('extractProviderCostUsd', () => {
    it('pulls OpenRouter\'s own USD cost out of providerMetadata', () => {
        expect(extractProviderCostUsd({ openrouter: { usage: { cost: 0.0031 } } })).toBe(0.0031)
    })

    it('returns null for providers that report tokens but no money (Anthropic, OpenAI)', () => {
        expect(extractProviderCostUsd({ anthropic: { cacheCreationInputTokens: 50 } })).toBeNull()
        expect(extractProviderCostUsd({ openai: {} })).toBeNull()
        expect(extractProviderCostUsd(undefined)).toBeNull()
        expect(extractProviderCostUsd({ openrouter: { usage: { cost: 'free' } } })).toBeNull()
    })
})

describe('credits <-> USD (revenue and COGS must be the same dollar)', () => {
    it('round-trips at 1000 credits = $1', () => {
        expect(usdToCredits(1)).toBe(1000)
        expect(creditsToUsd(1000)).toBe(1)
    })

    it('rounds a partial credit UP — a fraction consumed is a credit consumed', () => {
        expect(usdToCredits(0.0001)).toBe(1)
        expect(usdToCredits(0.0011)).toBe(2)
    })

    it('never returns a negative charge', () => {
        expect(usdToCredits(-5)).toBe(0)
        expect(creditsToUsd(-5)).toBe(0)
        expect(usdToCredits(NaN)).toBe(0)
    })
})
