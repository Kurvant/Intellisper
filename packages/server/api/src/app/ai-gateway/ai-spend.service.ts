import { type AiSpendRow, type AiSpendSummary, creditsToUsd } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../database/database-connection'

/**
 * AI Gateway — the read side. Aggregates the ledger into the numbers the business actually needs:
 * what we PAID (COGS), what we CHARGED (revenue), and the margin between them, broken down by the
 * product surface and the model.
 *
 * This answers the questions the OpenRouter key ledger structurally cannot, because it has exactly one
 * bucket per platform: "which product is burning the money?", "which model?", "are we selling this
 * below cost?".
 *
 * TENANT-SCOPE BOUNDARY (read this before adding a caller):
 *   - `summaryForPlatform` and its helpers are ALWAYS `WHERE "platformId" = $1`. Safe for a tenant.
 *   - `summaryAcrossPlatforms` is deliberately CROSS-TENANT (it aggregates over ALL platforms). It is
 *     OPERATOR-ONLY and must be reached ONLY through the operator-key-gated `aiGatewayAdminModule`.
 *     NEVER wire it to a tenant-facing route — it returns every customer's costs. The gate is what
 *     keeps it safe, not the query.
 */

/** Hard ceiling on the reporting window — a runaway range must not table-scan the whole ledger. */
const MAX_WINDOW_DAYS = 366
const DEFAULT_WINDOW_DAYS = 30

type AiSpendService = {
    summaryForPlatform: (params: { platformId: string, days?: number }) => Promise<AiSpendSummary>
    summaryAcrossPlatforms: (params: { days?: number, limit?: number }) => Promise<AiSpendRow[]>
}

// The logger is part of every service's signature here (call sites pass request.log); this one is a
// pure read path with nothing to report, so it goes unused rather than inventing noise for it.
export const aiSpendService = (_log: FastifyBaseLogger): AiSpendService => ({
    /**
     * Spend for ONE platform over a moving window, grouped by feature and by model.
     *
     * Aggregation happens in Postgres (SUM/GROUP BY over an index-backed range scan), not in Node —
     * we never pull raw rows across the wire to add them up in JS.
     */
    async summaryForPlatform(params: { platformId: string, days?: number }): Promise<AiSpendSummary> {
        const days = clampDays(params.days)
        const { platformId } = params

        const [byFeature, byModel, totals] = await Promise.all([
            groupBy(platformId, days, 'feature'),
            groupBy(platformId, days, 'model'),
            totalsFor(platformId, days),
        ])

        return {
            from: new Date(Date.now() - days * 86_400_000).toISOString(),
            to: new Date().toISOString(),
            totalCostUsd: totals.costUsd,
            totalRevenueUsd: totals.revenueUsd,
            totalMarginUsd: totals.revenueUsd - totals.costUsd,
            totalCalls: totals.calls,
            // Surfaced deliberately: calls whose cost we could not determine. If this is non-zero the
            // margin above is INCOMPLETE, and a reader must be able to see that rather than trust a
            // number that quietly booked unpriced volume as free.
            unpricedCalls: totals.unpricedCalls,
            byFeature,
            byModel,
        }
    },

    /**
     * Cross-tenant spend, for the internal operator dashboard: which CUSTOMERS cost us the most.
     * This is the view that tells us whether a given plan's price actually covers its usage.
     */
    async summaryAcrossPlatforms(params: { days?: number, limit?: number }): Promise<AiSpendRow[]> {
        const days = clampDays(params.days)
        const limit = Math.max(1, Math.min(200, params.limit ?? 50))

        const rows = await databaseConnection().query(
            `SELECT "platformId" AS key,
                    COUNT(*)::int                                                   AS calls,
                    COALESCE(SUM("inputTokens"), 0)::bigint                         AS "inputTokens",
                    COALESCE(SUM("outputTokens"), 0)::bigint                        AS "outputTokens",
                    COALESCE(SUM("cacheReadTokens"), 0)::bigint                     AS "cacheReadTokens",
                    COALESCE(SUM("cacheWriteTokens"), 0)::bigint                    AS "cacheWriteTokens",
                    COALESCE(SUM("costUsd"), 0)                                     AS "costUsd",
                    COALESCE(SUM("billedCredits"), 0)::bigint                       AS "billedCredits",
                    COUNT(*) FILTER (WHERE "costSource" = 'unpriced')::int          AS "unpricedCalls"
             FROM "ai_usage_ledger"
             WHERE "created" >= now() - ($1 || ' days')::interval
             GROUP BY "platformId"
             ORDER BY "costUsd" DESC
             LIMIT $2`,
            [String(days), limit],
        )
        return rows.map(toSpendRow)
    },
})

/** One GROUP BY over the platform's window. `dimension` is a fixed identifier, never user input. */
async function groupBy(platformId: string, days: number, dimension: 'feature' | 'model'): Promise<AiSpendRow[]> {
    const rows = await databaseConnection().query(
        `SELECT "${dimension}" AS key,
                COUNT(*)::int                                                   AS calls,
                COALESCE(SUM("inputTokens"), 0)::bigint                         AS "inputTokens",
                COALESCE(SUM("outputTokens"), 0)::bigint                        AS "outputTokens",
                COALESCE(SUM("cacheReadTokens"), 0)::bigint                     AS "cacheReadTokens",
                COALESCE(SUM("cacheWriteTokens"), 0)::bigint                    AS "cacheWriteTokens",
                COALESCE(SUM("costUsd"), 0)                                     AS "costUsd",
                COALESCE(SUM("billedCredits"), 0)::bigint                       AS "billedCredits",
                COUNT(*) FILTER (WHERE "costSource" = 'unpriced')::int          AS "unpricedCalls"
         FROM "ai_usage_ledger"
         WHERE "platformId" = $1
           AND "created" >= now() - ($2 || ' days')::interval
         GROUP BY "${dimension}"
         ORDER BY "costUsd" DESC`,
        [platformId, String(days)],
    )
    return rows.map(toSpendRow)
}

async function totalsFor(platformId: string, days: number): Promise<{ costUsd: number, revenueUsd: number, calls: number, unpricedCalls: number }> {
    const rows = await databaseConnection().query(
        `SELECT COUNT(*)::int                                          AS calls,
                COALESCE(SUM("costUsd"), 0)                            AS "costUsd",
                COALESCE(SUM("billedCredits"), 0)::bigint              AS "billedCredits",
                COUNT(*) FILTER (WHERE "costSource" = 'unpriced')::int AS "unpricedCalls"
         FROM "ai_usage_ledger"
         WHERE "platformId" = $1
           AND "created" >= now() - ($2 || ' days')::interval`,
        [platformId, String(days)],
    )
    const r = rows[0] ?? {}
    return {
        calls: num(r.calls),
        costUsd: num(r.costUsd),
        revenueUsd: creditsToUsd(num(r.billedCredits)),
        unpricedCalls: num(r.unpricedCalls),
    }
}

function toSpendRow(r: Record<string, unknown>): AiSpendRow {
    const inputTokens = num(r.inputTokens)
    const outputTokens = num(r.outputTokens)
    const cacheReadTokens = num(r.cacheReadTokens)
    const cacheWriteTokens = num(r.cacheWriteTokens)
    const costUsd = num(r.costUsd)
    const revenueUsd = creditsToUsd(num(r.billedCredits))
    return {
        key: String(r.key ?? ''),
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        // The four token classes are DISJOINT (fresh input excludes cache), so this total counts each
        // token exactly once — which is the entire point of normalizing them on the way in.
        totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
        calls: num(r.calls),
        costUsd,
        revenueUsd,
        marginUsd: revenueUsd - costUsd,
        unpricedCalls: num(r.unpricedCalls),
    }
}

/**
 * Postgres returns NUMERIC and BIGINT as STRINGS (to avoid silent precision loss in JS). Coercing
 * them explicitly here is what stops a `SUM(costUsd)` from arriving as "0.00381000" and being
 * concatenated instead of added somewhere downstream.
 */
function num(v: unknown): number {
    const n = typeof v === 'number' ? v : Number(v ?? 0)
    return Number.isFinite(n) ? n : 0
}

function clampDays(days: number | undefined): number {
    if (days === undefined || !Number.isFinite(days) || days <= 0) return DEFAULT_WINDOW_DAYS
    return Math.min(Math.floor(days), MAX_WINDOW_DAYS)
}
