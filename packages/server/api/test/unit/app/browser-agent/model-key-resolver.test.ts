import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AI provider-key unification (credit merge) unit tests. Cover the resolver's managed-vs-env
 * decision + fault tolerance + caching, the OpenRouter model-id mapping, and the credit-exhaustion
 * detection/mapping — the seams that route agent spend into the shared credit pool without touching
 * the facade's tiering/caching/billedTokens contract. The AI SDK itself is not exercised here.
 */

const { flagEnabled, getEnriched } = vi.hoisted(() => ({
    flagEnabled: vi.fn().mockReturnValue(true),
    getEnriched: vi.fn(),
}))

vi.mock('../../../../src/app/flags/flag.service', () => ({
    flagService: () => ({ aiCreditsEnabled: flagEnabled }),
}))
vi.mock('../../../../src/app/ai/ai-provider-service', () => ({
    aiProviderService: () => ({ getIntellisperProviderIfEnriched: getEnriched }),
}))

import { toOpenRouterModelId } from '../../../../src/app/browser-agent/model-provider/model-provider.config'
import { _resetKeyResolverCache, browserAgentKeyResolver, OPENROUTER_BASE_URL } from '../../../../src/app/browser-agent/model-provider/model-key-resolver'
// Imported statically, like every other module under test here. `isCreditExhaustionError` is a pure
// function, but its module pulls in the whole AI SDK (anthropic/openai/openrouter + `ai`), which
// costs seconds to transform. Loaded lazily inside a test body, that cost is billed to the 5s test
// timeout and the suite fails on slower/cold CI machines for no functional reason. At module scope
// it is paid once during collection, where it belongs.
import { isCreditExhaustionError } from '../../../../src/app/browser-agent/model-provider/model-provider.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const resolver = () => browserAgentKeyResolver(log)

beforeEach(() => {
    _resetKeyResolverCache()
    flagEnabled.mockReset().mockReturnValue(true)
    getEnriched.mockReset().mockResolvedValue(null)
})

describe('browserAgentKeyResolver.resolve — managed vs env', () => {
    it('MANAGED when the platform has an enriched provider key + credits enabled', async () => {
        getEnriched.mockResolvedValue({ apiKey: 'or-key-123', apiKeyHash: 'hash-abc' })
        const r = await resolver().resolve('p1')
        expect(r).toEqual({ mode: 'managed', apiKey: 'or-key-123', apiKeyHash: 'hash-abc', baseURL: OPENROUTER_BASE_URL })
    })

    it('ENV when managed AI is disabled by the edition flag (never consults the provider stack)', async () => {
        flagEnabled.mockReturnValue(false)
        getEnriched.mockResolvedValue({ apiKey: 'or-key-123', apiKeyHash: 'hash-abc' })
        const r = await resolver().resolve('p1')
        expect(r).toEqual({ mode: 'env' })
        expect(getEnriched).not.toHaveBeenCalled()
    })

    it('ENV when no managed key is provisioned (CE / not-enriched)', async () => {
        getEnriched.mockResolvedValue(null)
        expect(await resolver().resolve('p1')).toEqual({ mode: 'env' })
    })

    it('ENV when the enriched key is empty/partial (defensive)', async () => {
        getEnriched.mockResolvedValue({ apiKey: '', apiKeyHash: 'h' })
        expect(await resolver().resolve('p1')).toEqual({ mode: 'env' })
        getEnriched.mockResolvedValue({ apiKey: 'k' }) // missing hash
        _resetKeyResolverCache()
        expect(await resolver().resolve('p1')).toEqual({ mode: 'env' })
    })

    it('ENV when platformId is absent (no platform context)', async () => {
        expect(await resolver().resolve(undefined)).toEqual({ mode: 'env' })
        expect(await resolver().resolve('')).toEqual({ mode: 'env' })
    })

    it('FAILS SAFE to env on a resolution error — never throws, does not cache the failure', async () => {
        getEnriched.mockRejectedValueOnce(new Error('db down'))
        expect(await resolver().resolve('p1')).toEqual({ mode: 'env' })
        // A transient failure self-heals: the next call retries (not cached) and can go managed.
        getEnriched.mockResolvedValue({ apiKey: 'k2', apiKeyHash: 'h2' })
        expect((await resolver().resolve('p1')).mode).toBe('managed')
    })
})

describe('browserAgentKeyResolver.resolve — caching (efficiency)', () => {
    it('caches the resolved mode per platform (no repeated provider-stack hit within TTL)', async () => {
        getEnriched.mockResolvedValue({ apiKey: 'k', apiKeyHash: 'h' })
        await resolver().resolve('p1')
        await resolver().resolve('p1')
        await resolver().resolve('p1')
        expect(getEnriched).toHaveBeenCalledTimes(1)
    })

    it('caches per platform independently', async () => {
        getEnriched.mockImplementation(async (pid: string) => (pid === 'pm' ? { apiKey: 'k', apiKeyHash: 'h' } : null))
        expect((await resolver().resolve('pm')).mode).toBe('managed')
        expect((await resolver().resolve('pe')).mode).toBe('env')
        // cached — repeats don't re-hit
        await resolver().resolve('pm')
        await resolver().resolve('pe')
        expect(getEnriched).toHaveBeenCalledTimes(2)
    })
})

describe('toOpenRouterModelId — provider-namespaced ids for the managed rail', () => {
    it('prefixes the provider slug', () => {
        expect(toOpenRouterModelId({ provider: 'anthropic', model: 'claude-haiku-4-5' })).toBe('anthropic/claude-haiku-4-5')
        expect(toOpenRouterModelId({ provider: 'openai', model: 'gpt-4o' })).toBe('openai/gpt-4o')
    })
    it('is idempotent for already-namespaced ids', () => {
        expect(toOpenRouterModelId({ provider: 'anthropic', model: 'anthropic/claude-opus-4-6' })).toBe('anthropic/claude-opus-4-6')
    })
})

describe('isCreditExhaustionError — detect OpenRouter credit exhaustion', () => {
    it('matches a 402 status (statusCode or status)', () => {
        expect(isCreditExhaustionError({ statusCode: 402 })).toBe(true)
        expect(isCreditExhaustionError({ status: 402 })).toBe(true)
    })
    it('matches insufficient-credit / quota / payment-required messages', () => {
        for (const m of ['Insufficient credits', 'quota exceeded', 'Payment Required', 'credit limit reached', 'negative credit balance']) {
            expect(isCreditExhaustionError(new Error(m))).toBe(true)
        }
    })
    it('does NOT match ordinary transient/errors', () => {
        expect(isCreditExhaustionError(new Error('rate limit 429'))).toBe(false)
        expect(isCreditExhaustionError(new Error('overloaded'))).toBe(false)
        expect(isCreditExhaustionError({ statusCode: 500 })).toBe(false)
    })
})
