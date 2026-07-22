/**
 * AI Gateway — the wire contract for a single metered AI call, plus the normalizer that turns any
 * provider's usage payload into the disjoint token components the cost calculator needs.
 *
 * This type crosses process boundaries (engine → worker → API over the Socket.IO RPC contract), so
 * it lives in shared and is validated with zod at the API edge. It is deliberately flat and boring.
 */
import { z } from 'zod'

/**
 * Which product surface spent the money. This is the axis the business actually cares about — it is
 * what lets us say "the browser agent's research tool is 60% of this customer's cost", which is the
 * question the OpenRouter key ledger structurally cannot answer (it has one bucket per platform).
 */
export enum AiFeature {
    /** Intellisper browser agent — the autonomous loop, its tools, research, and memory. */
    BROWSER_AGENT = 'browser_agent',
    /** Studio chat agent (the flow-building assistant that runs in the worker). */
    STUDIO_CHAT = 'studio_chat',
    /** An AI block inside a customer's flow, running in the engine sandbox. */
    FLOW_BLOCK = 'flow_block',
    /** Non-user-facing platform work (credential validation pings, title generation, distillation). */
    PLATFORM = 'platform',
}

export enum AiModality {
    TEXT = 'text',
    EMBEDDING = 'embedding',
}

/**
 * How the model was reached. `managed` = through the platform's OpenRouter key, so the spend already
 * debited the customer's credit pool. `direct` = one of our own env/vendor keys, so the spend hit our
 * card and was, until this gateway existed, invisible. `byok` = the customer's own key (their cost,
 * not ours — recorded for their visibility, excluded from OUR COGS).
 */
export enum AiKeyMode {
    MANAGED = 'managed',
    DIRECT = 'direct',
    BYOK = 'byok',
}

/** The disjoint token components. NEVER carries a `total` — see model-pricing for why. */
export const AiTokenCounts = z.object({
    /** Fresh input tokens only. Excludes cached reads and cache writes. */
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
})
export type AiTokenCounts = z.infer<typeof AiTokenCounts>

/**
 * One metered AI call, as reported by any plane.
 *
 * `idempotencyKey` is the anti-double-count guarantee and is REQUIRED. Every transport we use is
 * at-least-once (a retried worker job, a re-delivered RPC, a resumed engine step), so a call CAN be
 * reported twice. A unique index on this key makes the second write a no-op. Double-counted spend is
 * precisely the kind of "misleading report" that gets expensive, so it is enforced by the database
 * rather than by everyone remembering to be careful.
 */
export const ReportAiUsageRequest = z.object({
    idempotencyKey: z.string().min(1).max(128),

    // attribution — platformId is mandatory because every read of this table is tenant-filtered.
    platformId: z.string().min(1).max(21),
    projectId: z.string().max(21).nullish(),
    userId: z.string().max(21).nullish(),
    feature: z.nativeEnum(AiFeature),
    /** runId / conversationId / flowRunId — whatever identifies the unit of work that spent this. */
    featureRef: z.string().max(64).nullish(),

    // what was called
    provider: z.string().min(1).max(64),
    model: z.string().min(1).max(128),
    modality: z.nativeEnum(AiModality),
    keyMode: z.nativeEnum(AiKeyMode),

    tokens: AiTokenCounts,

    /**
     * The provider's OWN cost for this call, in USD, when it reports one (OpenRouter does).
     * When present this is recorded verbatim and the price table is not consulted. The vendor's
     * number is the fact; ours is the approximation.
     */
    providerCostUsd: z.number().nonnegative().nullish(),

    /** Provider request id, when available — the thread back to the vendor's own logs for disputes. */
    requestId: z.string().max(128).nullish(),

    /** Epoch ms the call completed. Supplied by the caller so a queued report keeps its true time. */
    occurredAt: z.number().int().positive(),
})
export type ReportAiUsageRequest = z.infer<typeof ReportAiUsageRequest>

/** A batch. Cross-process planes buffer and flush, so the wire carries N calls, not one. */
export const ReportAiUsageBatchRequest = z.object({
    calls: z.array(ReportAiUsageRequest).min(1).max(500),
})
export type ReportAiUsageBatchRequest = z.infer<typeof ReportAiUsageBatchRequest>

/**
 * The AI SDK's usage object — loosely typed here so shared takes no dependency on the SDK.
 *
 * CRITICAL: the SDK reports usage in TWO different shapes depending on where you stand, and both
 * reach this function:
 *
 *   FLAT (user-facing, `ai`'s LanguageModelUsage) — what `generateText().usage` returns:
 *       { inputTokens: 1250, inputTokenDetails: { noCacheTokens, cacheReadTokens, cacheWriteTokens } }
 *
 *   NESTED (provider-level, `LanguageModelV3Usage`) — what a MIDDLEWARE sees, and what arrives on a
 *   stream's `finish` part:
 *       { inputTokens: { total, noCache, cacheRead, cacheWrite }, outputTokens: { total, reasoning } }
 *
 * Our gateway intercepts at the middleware layer, so it sees the NESTED shape — while some callers
 * hand us the FLAT one. Reading only the flat shape would coerce every nested payload to ZERO tokens:
 * a ledger full of free calls and 100% phantom margin. So we accept both, explicitly.
 */
export type SdkLanguageModelUsage = {
    /** Flat: a number. Nested: an object. Both are handled. */
    inputTokens?: number | {
        total?: number
        noCache?: number
        cacheRead?: number
        cacheWrite?: number
    }
    outputTokens?: number | {
        total?: number
        text?: number
        reasoning?: number
    }
    totalTokens?: number
    /** Flat shape only. */
    inputTokenDetails?: {
        noCacheTokens?: number
        cacheReadTokens?: number
        cacheWriteTokens?: number
    }
    /** Flat shape only. */
    outputTokenDetails?: {
        textTokens?: number
        reasoningTokens?: number
    }
    /** @deprecated by the SDK — read inputTokenDetails.cacheReadTokens instead. Kept for old payloads. */
    cachedInputTokens?: number
    /** @deprecated by the SDK — read outputTokenDetails.reasoningTokens instead. Kept for old payloads. */
    reasoningTokens?: number
    raw?: unknown
}

/**
 * Normalize any provider's usage into the four DISJOINT token components.
 *
 * This function is the single place the provider-semantics trap is defused, so no call site has to
 * remember it. Verified against the installed SDKs:
 *
 *   Anthropic  inputTokens.total = noCache + cacheRead + cacheWrite   (total INCLUDES the cache)
 *   OpenAI     inputTokens.total = prompt_tokens, noCache = total - cacheRead  (cache is a SUBSET)
 *
 * If we billed `inputTokens` (the total) AND cacheRead AND cacheWrite, Anthropic calls would be
 * double-billed for every cached token — and our browser agent writes a cache breakpoint on EVERY
 * turn, so that error would land on our single largest AI cost. So we never use the total:
 *
 *   - Prefer the SDK's explicit `noCacheTokens`, which every provider computes correctly.
 *   - Only if it is absent do we derive it, and we derive it SAFELY: subtract the cache components
 *     from the total and clamp at zero. Under Anthropic semantics that yields the true fresh input;
 *     under OpenAI semantics cacheWrite is undefined (0), so it reduces to total - cacheRead, which
 *     is also correct. One expression, both semantics, no branching on provider name — so a new
 *     provider cannot silently pick the wrong branch.
 */
export function normalizeUsage(usage: SdkLanguageModelUsage | undefined | null): AiTokenCounts {
    const empty = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }
    if (usage === null || usage === undefined) {
        return empty
    }

    const rawIn = usage.inputTokens
    const rawOut = usage.outputTokens
    // Which shape are we holding? The middleware sees the nested one; direct SDK callers see the flat.
    const nestedIn = typeof rawIn === 'object' && rawIn !== null ? rawIn : undefined
    const nestedOut = typeof rawOut === 'object' && rawOut !== null ? rawOut : undefined

    // Cache components mean exactly the same thing in both shapes — only their field names differ.
    const cacheRead = int(nestedIn?.cacheRead ?? usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens)
    const cacheWrite = int(nestedIn?.cacheWrite ?? usage.inputTokenDetails?.cacheWriteTokens)

    // Prefer the provider's OWN "fresh input" figure, which every provider computes correctly.
    const explicitNoCache = nestedIn?.noCache ?? usage.inputTokenDetails?.noCacheTokens
    // Only if it is absent do we derive it — from the total, minus the cache, clamped at zero.
    // Anthropic's total INCLUDES the cache, so subtracting yields the true fresh input; OpenAI's
    // cacheWrite is undefined (0), so it reduces to total - cacheRead, which is also correct.
    // One expression, both semantics — a new provider cannot silently take the wrong branch.
    const inputTotal = int(nestedIn?.total ?? (typeof rawIn === 'number' ? rawIn : undefined))
    const inputTokens = explicitNoCache !== undefined && explicitNoCache !== null
        ? int(explicitNoCache)
        : Math.max(0, inputTotal - cacheRead - cacheWrite)

    const outputTokens = int(nestedOut?.total ?? (typeof rawOut === 'number' ? rawOut : undefined))
    const reasoningTokens = int(
        nestedOut?.reasoning ?? usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens,
    )

    return { inputTokens, outputTokens, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, reasoningTokens }
}

/**
 * Pull the provider's self-reported USD cost out of providerMetadata, when it offers one.
 *
 * Only OpenRouter does today: `providerMetadata.openrouter.usage.cost`. This is the number OpenRouter
 * actually debited from the key, which makes it authoritative for every managed-mode call — and it
 * arrives on a response we are already awaiting, at zero extra cost and zero added latency.
 * Anthropic and OpenAI report tokens but no money, so those fall through to the price table.
 */
export function extractProviderCostUsd(providerMetadata: unknown): number | null {
    const meta = providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined | null
    const cost = meta?.openrouter?.usage?.cost
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
        return cost
    }
    return null
}

/** Provider request id, for tracing a disputed charge back to the vendor's own logs. */
export function extractRequestId(response: unknown): string | null {
    const r = response as { id?: unknown } | undefined | null
    return typeof r?.id === 'string' && r.id.length > 0 ? r.id.slice(0, 128) : null
}

/** Coerce anything a provider hands us into a safe non-negative integer token count. */
function int(n: unknown): number {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0
    return Math.round(n)
}

/** Shape of one aggregated row in the spend dashboard. */
export type AiSpendRow = {
    /** The grouping key's value, e.g. the feature, the model, or the platform id. */
    key: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    totalTokens: number
    calls: number
    /** What we PAID (COGS). */
    costUsd: number
    /** What the customer was CHARGED, in USD. */
    revenueUsd: number
    /** revenueUsd - costUsd. Negative means we are selling this below cost. */
    marginUsd: number
    /**
     * Tokens whose cost we could NOT determine (no provider cost, no price-table entry). Surfaced so
     * an incomplete price table shows up as a visible hole rather than as free money and 100% margin.
     */
    unpricedCalls: number
}

export type AiSpendSummary = {
    from: string
    to: string
    totalCostUsd: number
    totalRevenueUsd: number
    totalMarginUsd: number
    totalCalls: number
    unpricedCalls: number
    byFeature: AiSpendRow[]
    byModel: AiSpendRow[]
}

/** Query for a spend report. The window is clamped server-side; a caller cannot ask for everything. */
export const AiSpendQuery = z.object({
    days: z.coerce.number().int().positive().max(366).optional(),
})
export type AiSpendQuery = z.infer<typeof AiSpendQuery>

export const AiSpendAdminQuery = AiSpendQuery.extend({
    limit: z.coerce.number().int().positive().max(200).optional(),
})
export type AiSpendAdminQuery = z.infer<typeof AiSpendAdminQuery>

const AiSpendRowSchema = z.object({
    key: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadTokens: z.number(),
    cacheWriteTokens: z.number(),
    totalTokens: z.number(),
    calls: z.number(),
    costUsd: z.number(),
    revenueUsd: z.number(),
    marginUsd: z.number(),
    unpricedCalls: z.number(),
})

export const AiSpendSummaryResponse = z.object({
    from: z.string(),
    to: z.string(),
    totalCostUsd: z.number(),
    totalRevenueUsd: z.number(),
    totalMarginUsd: z.number(),
    totalCalls: z.number(),
    unpricedCalls: z.number(),
    byFeature: z.array(AiSpendRowSchema),
    byModel: z.array(AiSpendRowSchema),
})

export const AiSpendAdminResponse = z.object({
    rows: z.array(AiSpendRowSchema),
})
