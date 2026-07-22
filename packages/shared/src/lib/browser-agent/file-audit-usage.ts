import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'

export const AgentFile = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    userId: z.string(),
    conversationId: Nullable(z.string()),
    name: z.string(),
    mime: z.string(),
    sizeBytes: z.number(),
    /** sha256 of the bytes — dedupe key + cache key. */
    contentHash: z.string(),
    s3Key: z.string(),
    version: z.number(),
    deletedAt: Nullable(z.string()),
})
export type AgentFile = z.infer<typeof AgentFile>

export const AgentAuditLog = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    userId: z.string(),
    runId: Nullable(z.string()),
    event: z.string(),
    detail: Nullable(z.record(z.string(), z.unknown())),
})
export type AgentAuditLog = z.infer<typeof AgentAuditLog>

/**
 * Monthly, atomically-incremented usage counter. Caps are POOLED PER PLATFORM, so the subject is
 * always the platformId (one row per platform × period × metric). period is 'YYYY-MM' (UTC).
 */
export const AgentUsageMetric = {
    ACTIONS: 'ACTIONS',
    RESEARCH: 'RESEARCH',
    FILE_OPS: 'FILE_OPS',
    ROUTINE_RUNS: 'ROUTINE_RUNS',
    QUICK_TOOLS: 'QUICK_TOOLS',
    MEMORY_OPS: 'MEMORY_OPS',
} as const
export type AgentUsageMetric = (typeof AgentUsageMetric)[keyof typeof AgentUsageMetric]

export const AgentUsageCounter = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    period: z.string(),
    metric: z.enum([
        AgentUsageMetric.ACTIONS,
        AgentUsageMetric.RESEARCH,
        AgentUsageMetric.FILE_OPS,
        AgentUsageMetric.ROUTINE_RUNS,
        AgentUsageMetric.QUICK_TOOLS,
        AgentUsageMetric.MEMORY_OPS,
    ]),
    count: z.number(),
})
export type AgentUsageCounter = z.infer<typeof AgentUsageCounter>

/**
 * Maps a tool name to the metered usage metric it consumes. Only the browser-agent tools that carry
 * real cost are metered; read/free tools (readPage/summarise/answerWithCitations/extractFacts,
 * listRoutines/runRoutine/saveRoutine) return undefined and are never counted. ROUTINE_RUNS and
 * QUICK_TOOLS are metered at their own seams (routine replay / batch row, grammar), not here.
 */
function metricForToolName(name: string): AgentUsageMetric | undefined {
    return TOOL_TO_METRIC[name]
}

/** `YYYY-MM` (UTC) — the monthly period key used by the per-platform usage counter. */
function usagePeriod(now: Date): string {
    const y = now.getUTCFullYear()
    const m = String(now.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
}

/** True when a cap value means "no limit". `-1` = unlimited (enterprise); `null`/`undefined` = unset. */
function isUnlimitedCap(cap: number | null | undefined): boolean {
    return cap === UNLIMITED_CAP || cap === null || cap === undefined
}

const TOOL_TO_METRIC: Record<string, AgentUsageMetric> = {
    // Browser actions → ACTIONS
    navigate: AgentUsageMetric.ACTIONS,
    click: AgentUsageMetric.ACTIONS,
    type: AgentUsageMetric.ACTIONS,
    selectOption: AgentUsageMetric.ACTIONS,
    scroll: AgentUsageMetric.ACTIONS,
    submitForm: AgentUsageMetric.ACTIONS,
    screenshot: AgentUsageMetric.ACTIONS,
    // Research → RESEARCH (fetchUrl gathers a source; compileReport synthesises)
    fetchUrl: AgentUsageMetric.RESEARCH,
    compileReport: AgentUsageMetric.RESEARCH,
    // Files → FILE_OPS
    readFile: AgentUsageMetric.FILE_OPS,
    editFile: AgentUsageMetric.FILE_OPS,
    // Memory → MEMORY_OPS
    remember: AgentUsageMetric.MEMORY_OPS,
    recall: AgentUsageMetric.MEMORY_OPS,
    forget: AgentUsageMetric.MEMORY_OPS,
}

/** Cap sentinel: unlimited (used for enterprise tiers). Distinct from 0 (= feature not included). */
export const UNLIMITED_CAP = -1

export const AgentUsageProjectRequest = z.object({ projectId: z.string() })
export type AgentUsageProjectRequest = z.infer<typeof AgentUsageProjectRequest>

/** Current-month usage + the plan caps for each metered metric (feeds the billing/usage surface). */
export const AgentUsageSummaryResponse = z.object({
    period: z.string(),
    metrics: z.array(z.object({
        metric: z.enum([
            AgentUsageMetric.ACTIONS,
            AgentUsageMetric.RESEARCH,
            AgentUsageMetric.FILE_OPS,
            AgentUsageMetric.ROUTINE_RUNS,
            AgentUsageMetric.QUICK_TOOLS,
            AgentUsageMetric.MEMORY_OPS,
        ]),
        used: z.number(),
        cap: z.number(),
    })),
})
export type AgentUsageSummaryResponse = z.infer<typeof AgentUsageSummaryResponse>

/** Grouped helpers for browser-agent usage metering (single export per the shared util-object rule). */
export const agentUsage = {
    metricForToolName,
    usagePeriod,
    isUnlimitedCap,
}

/**
 * Per-plan browser-agent entitlement caps. Resolved server-side from the platform's plan
 * (`browserAgentPlan` resolver). Monthly caps are pooled per platform (matching the usage counter);
 * `0` = the feature is not included on the plan; `UNLIMITED_CAP` (-1) = no limit.
 */
export const BrowserAgentRecallTier = z.enum(['free', 'pro', 'enterprise'])
export type BrowserAgentRecallTier = z.infer<typeof BrowserAgentRecallTier>

/**
 * Runtime schema for the caps. This is persisted as ONE jsonb column on `platform_plan`
 * (`agentCaps`) so a plan change sets the whole entitlement set atomically — no multi-column drift
 * between the Stripe reconciler and the resolver.
 */
export const BrowserAgentCaps = z.object({
    /** Monthly caps, keyed by metered metric. */
    monthly: z.object({
        [AgentUsageMetric.ACTIONS]: z.number(),
        [AgentUsageMetric.RESEARCH]: z.number(),
        [AgentUsageMetric.FILE_OPS]: z.number(),
        [AgentUsageMetric.ROUTINE_RUNS]: z.number(),
        [AgentUsageMetric.QUICK_TOOLS]: z.number(),
        [AgentUsageMetric.MEMORY_OPS]: z.number(),
    }),
    /** Max rows in a single batch (0 = batch automation not included). */
    maxBatchRows: z.number(),
    /** Max rows of a batch that may run concurrently. */
    maxConcurrentRows: z.number(),
    /** Max enabled schedules the user may keep (0 = scheduling not included). */
    maxSchedules: z.number(),
    /** Whether the top reasoning tier (Opus-class escalation) is allowed. */
    reasoningAllowed: z.boolean(),
    /**
     * @deprecated Memory is a cross-product capability and its entitlement now lives in the
     * standalone `MemoryCaps` blob (`platform_plan.memoryCaps`) — see `lib/memory/memory-caps.ts`.
     * These fields are retained ONLY so existing persisted `agentCaps` blobs still validate and so
     * the migration can project them into `memoryCaps`. Nothing reads them for entitlement any more;
     * read `memoryPlan.capsForPlatform()` instead.
     *
     * They stay optional so a caps blob written after the split (which omits them) is still valid.
     */
    recallTier: BrowserAgentRecallTier.optional(),
    /** @deprecated see `recallTier` above — use `MemoryCaps.enabled`. */
    memoryEnabled: z.boolean().optional(),
    /** @deprecated see `recallTier` above — use `MemoryCaps.maxFacts`. */
    maxFacts: z.number().optional(),
})
export type BrowserAgentCaps = z.infer<typeof BrowserAgentCaps>
