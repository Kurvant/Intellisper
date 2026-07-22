import {
    AGENT_CAPS_NONE,
    AgentUsageMetric,
    type BrowserAgentCaps,
    UNLIMITED_CAP,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../../database/database-connection'

/**
 * browserAgentPlan — the SINGLE seam that resolves a platform's browser-agent entitlement caps
 * (batch/schedule/reasoning/recall + the six monthly metric caps).
 *
 * It now reads the plan row directly: `platform_plan.agentCaps` (one jsonb blob holding the whole
 * `BrowserAgentCaps` set) gated by `platform_plan.browserAgentEnabled`. This is the swap point the
 * metering layer was built around — every call site (batch/schedule/runtime/grammar/usage) already
 * reads from this resolver and needed no change when the plan columns landed.
 *
 * Caps semantics (shared `BrowserAgentCaps`): a monthly cap of `0` = the feature is not included on
 * the plan (denied with an upgrade prompt); `UNLIMITED_CAP` (-1) = no limit (enterprise).
 *
 * SAFETY — this resolver decides paid entitlements. It separates a RESOLVED answer from a FAILURE to
 * resolve, because conflating them is how a billing system either leaks capacity or falsely denies a
 * paying customer:
 *  - Resolved "agent not enabled" / no plan row / malformed caps → AGENT_CAPS_NONE (deny). These are
 *    real answers: the platform genuinely has no entitlement.
 *  - FAILED to resolve (DB error) → DEGRADED caps: privileges fail CLOSED (no Opus reasoning, no
 *    batch/schedule, shallowest recall — never over-grant), but the monthly metric caps are treated
 *    as unlimited so a transient DB blip cannot hard-deny a paying customer's normal work. The
 *    counter still records usage, so nothing is lost; `meter()` is itself fail-open by the same
 *    principle. This is the required split: fail-open for metering, fail-closed for privilege.
 */

type PlanCapsRow = {
    browserAgentEnabled: boolean | null
    agentCaps: BrowserAgentCaps | null
}

/**
 * Used ONLY when the plan could not be read (a transient fault). Grants no privilege (reasoning off,
 * no batch/schedule, shallowest recall) but does not block metered work — the alternative, denying,
 * would tell a paying customer their feature "isn't on their plan" because of a database hiccup.
 */
const DEGRADED_CAPS: BrowserAgentCaps = {
    monthly: {
        [AgentUsageMetric.ACTIONS]: UNLIMITED_CAP,
        [AgentUsageMetric.RESEARCH]: UNLIMITED_CAP,
        [AgentUsageMetric.FILE_OPS]: UNLIMITED_CAP,
        [AgentUsageMetric.ROUTINE_RUNS]: UNLIMITED_CAP,
        [AgentUsageMetric.QUICK_TOOLS]: UNLIMITED_CAP,
        [AgentUsageMetric.MEMORY_OPS]: UNLIMITED_CAP,
    },
    maxBatchRows: 0,
    maxConcurrentRows: 0,
    maxSchedules: 0,
    reasoningAllowed: false,
    // Memory no longer lives in this blob (see `memoryPlan`), so the deprecated fields are omitted.
    // Memory's own resolver applies the same fail-closed rule to its own faults.
}

/**
 * Validate a persisted caps blob before trusting it. A row written by an older/newer shape (or by a
 * hand-edit) must never be able to grant a capability implicitly — anything unrecognised is denied.
 */
function isValidCaps(caps: unknown): caps is BrowserAgentCaps {
    if (caps === null || typeof caps !== 'object') return false
    const c = caps as Partial<BrowserAgentCaps>
    if (typeof c.maxBatchRows !== 'number' || typeof c.maxConcurrentRows !== 'number') return false
    if (typeof c.maxSchedules !== 'number' || typeof c.reasoningAllowed !== 'boolean') return false
    // The memory fields (`memoryEnabled`/`maxFacts`/`recallTier`) are deliberately NOT validated any
    // more: memory moved to its own `memoryCaps` blob, so blobs written after the split legitimately
    // omit them, and blobs written before it carry values nothing reads. Requiring them here would
    // reject every post-split row and deny the agent entirely.
    const monthly = c.monthly as Record<string, unknown> | undefined
    if (monthly === null || typeof monthly !== 'object') return false
    for (const metric of ['ACTIONS', 'RESEARCH', 'FILE_OPS', 'ROUTINE_RUNS', 'QUICK_TOOLS', 'MEMORY_OPS']) {
        if (typeof monthly[metric] !== 'number') return false
    }
    return true
}

export const browserAgentPlan = (log: FastifyBaseLogger) => ({
    /** The full cap set for a platform. All the wired seams read from here. */
    async capsForPlatform(platformId: string): Promise<BrowserAgentCaps> {
        try {
            const rows: PlanCapsRow[] = await databaseConnection().query(
                'SELECT "browserAgentEnabled", "agentCaps" FROM "platform_plan" WHERE "platformId" = $1',
                [platformId],
            )
            const row = rows[0]
            // The agent is a product-scope door: closed → nothing is included, whatever the caps say.
            if (!row || row.browserAgentEnabled !== true) {
                return AGENT_CAPS_NONE
            }
            if (!isValidCaps(row.agentCaps)) {
                log.warn({ platformId }, '[baPlan] plan row has no valid agentCaps — denying (fail-closed)')
                return AGENT_CAPS_NONE
            }
            return row.agentCaps
        }
        catch (err) {
            // Could NOT resolve (transient). Privileges fail closed; metered work is not falsely
            // denied. See DEGRADED_CAPS.
            log.warn({ err: (err as Error).message, platformId }, '[baPlan] caps resolve failed — degraded (privileges closed, metering open)')
            return DEGRADED_CAPS
        }
    },

    // NOTE: memory's entitlement is NOT resolved here. It is a cross-product capability sold to
    // Studio as well as the agent, so it has its own resolver (`memoryPlan`, reading
    // `platform_plan.memoryCaps`) that never consults `browserAgentEnabled`. Resolving it from this
    // service would deny memory to every Studio-only platform, since this one returns
    // AGENT_CAPS_NONE the moment the agent door is shut.
})
