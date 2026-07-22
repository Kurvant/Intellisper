import { isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { aiProviderService } from '../../ai/ai-provider-service'
import { flagService } from '../../flags/flag.service'

/**
 * Browser-agent AI KEY RESOLVER — the single seam that unifies the agent's model spend with the
 * platform-wide AI-credit pool (the same rail the Flow side uses), WITHOUT changing the facade's
 * tiering / prompt-caching / billedTokens contract.
 *
 * Two modes per platform:
 *  - MANAGED: the platform has an enriched managed provider key (an OpenRouter key funded by
 *    `includedAiCredits`). The facade routes inference THROUGH this key, so OpenRouter meters real
 *    usage against the key's spend limit — i.e. the agent's spend debits the SAME pooled credit
 *    allowance exactly once (there is no separate debit primitive; consumption == routing through
 *    the key). Exhaustion surfaces as an OpenRouter 402 → mapped to AI_CREDIT_LIMIT_EXCEEDED.
 *  - ENV: no managed key (managed AI disabled, e.g. CE/self-host, or not yet provisioned). The
 *    facade falls back to the documented `BROWSER_AGENT_*` env keys — the existing behaviour, so
 *    nothing that works today breaks.
 *
 * EFFICIENCY: the agent makes many model calls per run; resolving the managed key means a DB read +
 * decrypt, so the result is cached per-platform for a short TTL. The common case is a memory hit.
 * The cache is fail-safe: any resolution error yields ENV mode (never blocks a turn) and is NOT
 * cached, so a transient failure self-heals on the next call.
 */

/** OpenRouter's OpenAI-compatible model gateway (NOT the provisioning URL). */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export type ResolvedAgentKey =
    | { mode: 'managed', apiKey: string, apiKeyHash: string, baseURL: string }
    | { mode: 'env' }

type CacheEntry = { value: ResolvedAgentKey, expiresAt: number }

// Per-platform resolution cache. In-process is correct here: the value is derived from platform
// state that changes rarely (a provider key being provisioned), and a short TTL bounds staleness;
// a fresh key provisioned on another instance is picked up within the TTL. Never caches ENV as a
// hard negative for long, so enabling managed AI takes effect quickly.
const RESOLUTION_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

export const browserAgentKeyResolver = (log: FastifyBaseLogger) => ({
    /**
     * Resolve the AI-key mode for a platform. Never throws — on any error returns ENV mode so a turn
     * is never blocked by a resolution hiccup. `platformId` undefined (no platform context) → ENV.
     */
    async resolve(platformId: string | undefined): Promise<ResolvedAgentKey> {
        if (isNil(platformId) || platformId.length === 0) {
            return { mode: 'env' }
        }
        const now = Date.now()
        const cached = cache.get(platformId)
        if (cached && cached.expiresAt > now) {
            return cached.value
        }
        try {
            // Managed AI must be enabled for this edition before we consult the provider stack.
            if (!flagService(log).aiCreditsEnabled()) {
                return this.cacheEnv(platformId, now)
            }
            const provider = await aiProviderService(log).getIntellisperProviderIfEnriched(platformId)
            if (isNil(provider) || isNil(provider.apiKey) || provider.apiKey === '' || isNil(provider.apiKeyHash)) {
                return this.cacheEnv(platformId, now)
            }
            const value: ResolvedAgentKey = {
                mode: 'managed',
                apiKey: provider.apiKey,
                apiKeyHash: provider.apiKeyHash,
                baseURL: OPENROUTER_BASE_URL,
            }
            cache.set(platformId, { value, expiresAt: now + RESOLUTION_TTL_MS })
            return value
        }
        catch (err) {
            // Fail-safe: never block a turn on a resolution error. Do NOT cache — retry next call.
            log.warn({ err: (err as Error).message, platformId }, '[browserAgentKeyResolver] managed-key resolution failed; using env fallback')
            return { mode: 'env' }
        }
    },

    /** Cache + return ENV mode (a real, resolved "no managed key" answer — safe to memoize briefly). */
    cacheEnv(platformId: string, now: number): ResolvedAgentKey {
        const value: ResolvedAgentKey = { mode: 'env' }
        cache.set(platformId, { value, expiresAt: now + RESOLUTION_TTL_MS })
        return value
    },
})

/** Test seam: clear the in-process resolution cache. */
export function _resetKeyResolverCache(): void {
    cache.clear()
}
