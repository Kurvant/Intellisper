import {
    agentUsage,
    AgentUsageMetric,
    ErrorCode,
    ibId,
    IntellisperError,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../../database/database-connection'

/**
 * Browser-agent usage metering. Atomically counts consumption of each metered metric
 * (ACTIONS / RESEARCH / FILE_OPS / ROUTINE_RUNS / QUICK_TOOLS / MEMORY_OPS) into
 * `browser_agent_usage_counter`, POOLED PER PLATFORM (one row per platform × period × metric,
 * period = 'YYYY-MM' UTC), and enforces the plan's monthly caps.
 *
 * The increment is a single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING count` — race-safe and
 * replica-safe (no read-modify-write window), matching the memory service's raw-SQL vector I/O style
 * (the unique index `uq_ba_usage_platform_period_metric` backs the conflict target).
 *
 * agentScope-exempt: the usage counter is keyed by platformId (a pooled tenant counter), NOT a
 * per-user owner-scoped resource — there is no userId column to scope by. Tenant isolation is the
 * platformId in every predicate; the caller's platform is resolved from the authenticated principal
 * upstream. So these reads/writes intentionally do not route through `agentScope`.
 */
export const browserAgentUsage = (log: FastifyBaseLogger) => ({
    /**
     * Enforce a monthly cap BEFORE a costly action, then count it. Order matters: we check the current
     * count against the cap first (so the Nth+1 action is refused, not silently counted), then
     * atomically increment. `cap = 0` means the feature is not on the plan; `UNLIMITED_CAP` (-1) or
     * null skips both the check and — when unlimited — still records usage for observability.
     *
     * Fail-open: a metering error never blocks legitimate work (a counter hiccup must not break the
     * agent). It logs and allows the action; caps are a soft business limit, not a safety control.
     */
    async meter(params: { platformId: string, metric: AgentUsageMetric, cap: number | null | undefined }): Promise<void> {
        const { platformId, metric, cap } = params
        if (cap === 0) {
            throw notIncluded(metric)
        }
        try {
            if (!agentUsage.isUnlimitedCap(cap)) {
                const current = await this.currentCount(platformId, metric)
                if (current >= (cap as number)) {
                    throw overCap(metric, cap as number)
                }
            }
            await this.increment(platformId, metric)
        }
        catch (err) {
            if (err instanceof IntellisperError) throw err
            log.warn({ err: (err as Error).message, platformId, metric }, '[baUsage] meter failed — allowing (fail-open)')
        }
    },

    /** Atomically bump the counter for the current UTC month; returns the new count. */
    async increment(platformId: string, metric: AgentUsageMetric): Promise<number> {
        const period = agentUsage.usagePeriod(new Date())
        const rows: Array<{ count: string | number }> = await databaseConnection().query(
            `INSERT INTO "browser_agent_usage_counter" ("id", "platformId", "period", "metric", "count", "created", "updated")
             VALUES ($1, $2, $3, $4, 1, now(), now())
             ON CONFLICT ("platformId", "period", "metric")
             DO UPDATE SET "count" = "browser_agent_usage_counter"."count" + 1, "updated" = now()
             RETURNING "count"`,
            [ibId(), platformId, period, metric],
        )
        return Number(rows[0]?.count ?? 0)
    },

    /** Current count for a metric in the current UTC month (0 when no row yet). */
    async currentCount(platformId: string, metric: AgentUsageMetric): Promise<number> {
        const period = agentUsage.usagePeriod(new Date())
        const rows: Array<{ count: string | number }> = await databaseConnection().query(
            'SELECT "count" FROM "browser_agent_usage_counter" WHERE "platformId" = $1 AND "period" = $2 AND "metric" = $3',
            [platformId, period, metric],
        )
        return Number(rows[0]?.count ?? 0)
    },

    /** All metric counts for the current UTC month (for the usage/billing surface). */
    async currentUsage(platformId: string): Promise<Record<string, number>> {
        const period = agentUsage.usagePeriod(new Date())
        const rows: Array<{ metric: string, count: string | number }> = await databaseConnection().query(
            'SELECT "metric", "count" FROM "browser_agent_usage_counter" WHERE "platformId" = $1 AND "period" = $2',
            [platformId, period],
        )
        const out: Record<string, number> = {}
        for (const m of Object.values(AgentUsageMetric)) out[m] = 0
        for (const r of rows) out[r.metric] = Number(r.count)
        return out
    },
})

function notIncluded(metric: AgentUsageMetric): IntellisperError {
    return new IntellisperError({
        code: ErrorCode.FEATURE_DISABLED,
        params: { message: `${friendly(metric)} is not included in your plan. Upgrade to use it.` },
    })
}

function overCap(metric: AgentUsageMetric, cap: number): IntellisperError {
    return new IntellisperError({
        code: ErrorCode.FEATURE_DISABLED,
        params: { message: `You have reached your monthly limit of ${cap} ${friendly(metric).toLowerCase()} for this plan. Upgrade for more, or wait until next month.` },
    })
}

function friendly(metric: AgentUsageMetric): string {
    switch (metric) {
        case AgentUsageMetric.ACTIONS: return 'Browser actions'
        case AgentUsageMetric.RESEARCH: return 'Research runs'
        case AgentUsageMetric.FILE_OPS: return 'File operations'
        case AgentUsageMetric.ROUTINE_RUNS: return 'Routine runs'
        case AgentUsageMetric.QUICK_TOOLS: return 'Quick tools'
        case AgentUsageMetric.MEMORY_OPS: return 'Memory operations'
    }
}
