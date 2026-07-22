/**
 * AI Gateway — model price table + cost calculator.
 *
 * This is the ONLY place in the system that turns tokens into money. It exists because AI inference
 * is our largest variable cost and, until now, we could not measure it: spend was a read-through of
 * OpenRouter's key ledger, so every direct-vendor call (Anthropic, OpenAI, Bedrock, Azure, Gemini)
 * cost us real money while contributing exactly zero to any number we could see.
 *
 * TWO RULES GOVERN THIS FILE.
 *
 * 1. THE PROVIDER IS THE SOURCE OF TRUTH. When a provider tells us what a call cost (OpenRouter
 *    returns a real USD `cost`), we record that verbatim and never second-guess it. The table below
 *    is a FALLBACK for providers that report tokens but not money. A rate we hardcode is a rate that
 *    can drift from reality; a rate the vendor bills us is not.
 *
 * 2. AN UNKNOWN MODEL IS NEVER GUESSED. If a model is not in the table and the provider gave us no
 *    cost, the call is recorded as `unpriced` with its raw tokens intact and zero dollars. It then
 *    shows up in the dashboard as *unpriced volume* — a visible hole. A silent zero folded into a
 *    margin calculation is how a pricing model quietly becomes a loss.
 */

/** Money is `number` (USD) in transit and NUMERIC(14,8) at rest. Never float-format for storage. */
export type UsdAmount = number

/**
 * Where a ledger row's cost came from. Every row carries this so no report ever blends
 * measured money with estimated money without saying which is which.
 */
export enum AiCostSource {
    /** The provider billed us this exact amount and told us so. Authoritative. */
    PROVIDER = 'provider',
    /** We derived it from token counts × our price table. Good, but an estimate. */
    COMPUTED = 'computed',
    /** No provider cost AND no price-table entry. Tokens recorded, cost is 0 and KNOWN to be wrong. */
    UNPRICED = 'unpriced',
}

/**
 * How a provider reports its input-token total. This distinction is NOT cosmetic — getting it wrong
 * double-bills every cached token, and our own browser agent writes a cache breakpoint on every turn.
 *
 * Verified against the installed SDKs (@ai-sdk/anthropic@3.0.72, @ai-sdk/openai@3.0.54):
 *
 *   Anthropic — inputTokens.total = noCache + cacheRead + cacheWrite   (total INCLUDES cache)
 *   OpenAI    — inputTokens.total = prompt_tokens, noCache = total - cacheRead   (cacheRead is a SUBSET)
 *
 * We defuse this by never billing from `total` at all: cost is always assembled from the three
 * disjoint components (noCache, cacheRead, cacheWrite), which mean the same thing everywhere.
 * The enum is retained for validation/telemetry, not for arithmetic.
 */
export enum InputTotalSemantics {
    /** `total` already contains the cached tokens (Anthropic). */
    TOTAL_INCLUDES_CACHE = 'total_includes_cache',
    /** `total` is the raw prompt count; cacheRead is carved out of it (OpenAI). */
    CACHE_SUBSET_OF_TOTAL = 'cache_subset_of_total',
}

/**
 * Rates are per 1 MILLION tokens, in USD — the unit every vendor publishes, so a rate can be
 * checked against a price page by eye without arithmetic. Conversion happens once, below.
 */
export type ModelRate = {
    /** Fresh, uncached input tokens. */
    inputPerMTok: number
    /** Generated output tokens. */
    outputPerMTok: number
    /**
     * Writing a token INTO the cache. Anthropic charges a PREMIUM for this (1.25x input) — it is not
     * a discount. The originating spec for this system said to apply "a 90% cost reduction on cached
     * tokens", which is true only of reads; applying it to writes would have systematically
     * UNDER-reported the cost of the browser agent, which caches on every single turn.
     * Null = this provider does not charge separately for cache writes (OpenAI's caching is implicit).
     */
    cacheWritePerMTok: number | null
    /** Reading a token FROM the cache. This is the genuinely cheap one (~0.1x input). */
    cacheReadPerMTok: number | null
}

export type ModelPrice = ModelRate & {
    provider: string
    model: string
    /** ISO date (YYYY-MM-DD) this rate took effect. Rates are never edited in place — a new rate is a new row. */
    effectiveFrom: string
}

/**
 * Price table version. STAMPED ONTO EVERY LEDGER ROW that we price ourselves.
 *
 * Why it matters: when a vendor changes rates, we add rows and bump this — we do NOT rewrite history.
 * Old rows keep the version they were priced under, so a historical margin report stays reproducible
 * and a rate change can never retroactively rewrite last quarter's numbers. If we ever DO want to
 * re-cost a window (e.g. we discover a rate was wrong), we can, deliberately, because the raw tokens
 * are stored alongside the money.
 */
export const AI_PRICE_VERSION = '2026-07-14'

/**
 * The price table. Rates in USD per million tokens, as published by the vendors.
 *
 * Keep this list SHORT and correct. An entry that is present but wrong is worse than an entry that is
 * absent: absent shows up as `unpriced` and gets attention, wrong shows up as a confident bad number.
 */
const PRICES: readonly ModelPrice[] = [
    // ---- Anthropic (cache write = 1.25x input, cache read = 0.1x input) ----
    { provider: 'anthropic', model: 'claude-haiku-4-5', effectiveFrom: '2026-01-01', inputPerMTok: 1.00, outputPerMTok: 5.00, cacheWritePerMTok: 1.25, cacheReadPerMTok: 0.10 },
    { provider: 'anthropic', model: 'claude-sonnet-4-5', effectiveFrom: '2026-01-01', inputPerMTok: 3.00, outputPerMTok: 15.00, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 },
    { provider: 'anthropic', model: 'claude-opus-4-5', effectiveFrom: '2026-01-01', inputPerMTok: 5.00, outputPerMTok: 25.00, cacheWritePerMTok: 6.25, cacheReadPerMTok: 0.50 },

    // ---- OpenAI (implicit caching: discounted reads, NO separate write charge) ----
    { provider: 'openai', model: 'gpt-4o', effectiveFrom: '2026-01-01', inputPerMTok: 2.50, outputPerMTok: 10.00, cacheWritePerMTok: null, cacheReadPerMTok: 1.25 },
    { provider: 'openai', model: 'gpt-4o-mini', effectiveFrom: '2026-01-01', inputPerMTok: 0.15, outputPerMTok: 0.60, cacheWritePerMTok: null, cacheReadPerMTok: 0.075 },

    // ---- OpenAI embeddings (input-only; no output, no cache) ----
    { provider: 'openai', model: 'text-embedding-3-small', effectiveFrom: '2026-01-01', inputPerMTok: 0.02, outputPerMTok: 0, cacheWritePerMTok: null, cacheReadPerMTok: null },
    { provider: 'openai', model: 'text-embedding-3-large', effectiveFrom: '2026-01-01', inputPerMTok: 0.13, outputPerMTok: 0, cacheWritePerMTok: null, cacheReadPerMTok: null },
]

const PER_MILLION = 1_000_000

/**
 * Normalize a model id to its table key. Providers decorate ids in ways that are not price-relevant:
 *
 *   "anthropic/claude-haiku-4-5"        OpenRouter namespaces by provider
 *   "claude-haiku-4-5-20251001"         Anthropic appends a dated snapshot
 *   "openai/gpt-4o:floor"               OpenRouter routing suffixes
 *
 * All three are the same product at the same price. We strip the decoration rather than enumerate
 * every variant, because an unmatched variant silently becomes `unpriced` — a hole in the numbers.
 */
export function normalizeModelId(model: string): { provider?: string, model: string } {
    let m = model.trim().toLowerCase()
    let provider: string | undefined

    // "anthropic/claude-haiku-4-5" → provider=anthropic, model=claude-haiku-4-5
    const slash = m.indexOf('/')
    if (slash > 0) {
        provider = m.slice(0, slash)
        m = m.slice(slash + 1)
    }
    // strip OpenRouter routing suffix ("...:floor", "...:nitro")
    const colon = m.indexOf(':')
    if (colon > 0) {
        m = m.slice(0, colon)
    }
    // strip a trailing 8-digit dated snapshot ("claude-haiku-4-5-20251001")
    m = m.replace(/-\d{8}$/, '')

    return { provider, model: m }
}

/**
 * Look up the rate in force for a model at a point in time. Returns null when we have no rate —
 * the caller MUST then record the row as `unpriced` rather than inventing a number.
 */
export function findModelPrice(provider: string, model: string, at?: Date): ModelPrice | null {
    const norm = normalizeModelId(model)
    // Prefer the provider embedded in the model id (OpenRouter's "anthropic/...") over the transport
    // provider ("openrouter"), because the price is a property of the model, not of how we reached it.
    const wantProvider = (norm.provider ?? provider).toLowerCase()
    const asOf = (at ?? new Date()).toISOString().slice(0, 10)

    let best: ModelPrice | null = null
    for (const p of PRICES) {
        if (p.provider !== wantProvider || p.model !== norm.model) continue
        if (p.effectiveFrom > asOf) continue // not yet in force
        // Take the LATEST rate that is already in force at `asOf`.
        if (best === null || p.effectiveFrom > best.effectiveFrom) best = p
    }
    return best
}

/** The disjoint token components a cost is assembled from. Never includes a `total`. */
export type TokenCounts = {
    /** Fresh input tokens — excludes anything cached. */
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
}

export type CostResult = {
    costUsd: UsdAmount
    costSource: AiCostSource
    /** Null when the provider gave us the cost (no table was consulted). */
    priceVersion: string | null
}

/**
 * Compute the cost of one AI call.
 *
 * `providerCostUsd` — pass it whenever the provider told us what it charged (OpenRouter does). It
 * wins unconditionally. We do not "sanity check" it against our table: the vendor's invoice is the
 * fact, and our table is the approximation.
 */
export function computeCallCost(params: {
    provider: string
    model: string
    tokens: TokenCounts
    providerCostUsd?: number | null
    at?: Date
}): CostResult {
    const { provider, model, tokens, providerCostUsd, at } = params

    // 1. Provider-reported cost wins. Accept 0 (a genuinely free/cached call) but reject
    //    negative/NaN/Infinity, which would corrupt every aggregate they land in.
    if (typeof providerCostUsd === 'number' && Number.isFinite(providerCostUsd) && providerCostUsd >= 0) {
        return { costUsd: providerCostUsd, costSource: AiCostSource.PROVIDER, priceVersion: null }
    }

    // 2. Fall back to our table.
    const price = findModelPrice(provider, model, at)
    if (price === null) {
        return { costUsd: 0, costSource: AiCostSource.UNPRICED, priceVersion: null }
    }

    // Assemble from DISJOINT components only — never from any `total` field. This is what makes the
    // math identical across providers whose `total` semantics differ (Anthropic's total includes
    // cache tokens; OpenAI's does not). Billing from `total` would double-count every cached token.
    const input = nonNeg(tokens.inputTokens)
    const output = nonNeg(tokens.outputTokens)
    const cacheRead = nonNeg(tokens.cacheReadTokens)
    const cacheWrite = nonNeg(tokens.cacheWriteTokens)

    // A provider with no separate cache-write charge (OpenAI) bills those tokens as ordinary input;
    // a provider with no cache-read rate likewise. Falling back to the input rate is the conservative
    // choice — it can never make a call look cheaper than it was.
    const cacheWriteRate = price.cacheWritePerMTok ?? price.inputPerMTok
    const cacheReadRate = price.cacheReadPerMTok ?? price.inputPerMTok

    const costUsd =
        (input * price.inputPerMTok
            + output * price.outputPerMTok
            + cacheWrite * cacheWriteRate
            + cacheRead * cacheReadRate) / PER_MILLION

    return { costUsd, costSource: AiCostSource.COMPUTED, priceVersion: AI_PRICE_VERSION }
}

/** Guard against a provider handing us a negative/NaN count that would poison an aggregate. */
function nonNeg(n: number | undefined | null): number {
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Credits are the unit we BILL the customer in: 1000 credits = 1 USD, matching
 * `CREDITS_PER_CURRENCY_UNIT` in platform-ai-credits.service. Kept here so revenue and COGS are
 * derived from one definition and a margin can never be computed against two different dollars.
 */
export const CREDITS_PER_USD = 1000

/** USD → credits, rounded up: a fraction of a credit consumed is a credit consumed. Never bill negative. */
export function usdToCredits(usd: number): number {
    if (!Number.isFinite(usd) || usd <= 0) return 0
    return Math.ceil(usd * CREDITS_PER_USD)
}

/** Credits → USD, for reporting revenue next to COGS in the same unit. */
export function creditsToUsd(credits: number): number {
    if (!Number.isFinite(credits) || credits <= 0) return 0
    return credits / CREDITS_PER_USD
}

/** Exposed for tests and for an admin "what do we think things cost" view. */
export const aiPricing = {
    all: (): readonly ModelPrice[] => PRICES,
    version: AI_PRICE_VERSION,
    find: findModelPrice,
    normalize: normalizeModelId,
    compute: computeCallCost,
}
