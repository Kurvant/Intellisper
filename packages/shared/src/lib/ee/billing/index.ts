import { z } from 'zod'
import { AgentUsageMetric, BrowserAgentCaps, UNLIMITED_CAP } from '../../browser-agent/file-audit-usage'
import { isNil, Nullable } from '../../core/common'
import { AiCreditsAutoTopUpState, PlanName, PlatformPlanWithOnlyLimits, PlatformUsageMetric, TeamProjectsLimit } from '../../management/platform'
import { BlocksFilterType } from '../../management/project'
import { MEMORY_CAPS_ENTERPRISE, MEMORY_CAPS_NONE, MEMORY_CAPS_PRO, MEMORY_CAPS_STARTER, MEMORY_CAPS_TEAM } from '../../memory/memory-caps'

export const PRICE_PER_EXTRA_ACTIVE_FLOWS = 5

export type ProjectPlanLimits = {
    nickname?: string
    locked?: boolean
    blocks?: string[]
    aiCredits?: number | null
    blocksFilterType?: BlocksFilterType
}

export enum IbSubscriptionStatus {
    ACTIVE = 'active',
    CANCELED = 'canceled',
}

export const METRIC_TO_LIMIT_MAPPING = {
    [PlatformUsageMetric.ACTIVE_FLOWS]: 'activeFlowsLimit',
} as const

export const METRIC_TO_USAGE_MAPPING = {
    [PlatformUsageMetric.ACTIVE_FLOWS]: 'activeFlows',
} as const

/** Map a browser-agent metered metric onto the platform-usage metric used in quota errors. */
export const AGENT_METRIC_TO_PLATFORM_METRIC: Record<AgentUsageMetric, PlatformUsageMetric> = {
    [AgentUsageMetric.ACTIONS]: PlatformUsageMetric.AGENT_ACTIONS,
    [AgentUsageMetric.RESEARCH]: PlatformUsageMetric.AGENT_RESEARCH,
    [AgentUsageMetric.FILE_OPS]: PlatformUsageMetric.AGENT_FILE_OPS,
    [AgentUsageMetric.ROUTINE_RUNS]: PlatformUsageMetric.AGENT_ROUTINE_RUNS,
    [AgentUsageMetric.QUICK_TOOLS]: PlatformUsageMetric.AGENT_QUICK_TOOLS,
    [AgentUsageMetric.MEMORY_OPS]: PlatformUsageMetric.AGENT_MEMORY_OPS,
}

// ── Browser-agent cap sets (SUBSCRIPTION_PLANS_PROPOSAL §3.1a) ──────────────────────────────────
// Amounts are the proposal's launch starting point, to be re-tuned from real telemetry (§9.4).
// `0` = the feature is not included on the plan; UNLIMITED_CAP (-1) = no limit.

function agentCaps(
    monthly: Record<AgentUsageMetric, number>,
    rest: Omit<BrowserAgentCaps, 'monthly'>,
): BrowserAgentCaps {
    return { monthly, ...rest }
}

/** No browser agent on this plan — every agent capability is closed. */
export const AGENT_CAPS_NONE: BrowserAgentCaps = agentCaps(
    {
        [AgentUsageMetric.ACTIONS]: 0, [AgentUsageMetric.RESEARCH]: 0, [AgentUsageMetric.FILE_OPS]: 0,
        [AgentUsageMetric.ROUTINE_RUNS]: 0, [AgentUsageMetric.QUICK_TOOLS]: 0, [AgentUsageMetric.MEMORY_OPS]: 0,
    },
    { maxBatchRows: 0, maxConcurrentRows: 0, maxSchedules: 0, reasoningAllowed: false },
)

/**
 * Agent Free — a safe trial: no batch/schedule, no reasoning.
 *
 * MEMORY_OPS is 0 to match the Free tier's closed memory door (`memoryCaps: MEMORY_CAPS_NONE` on the
 * plan): the metered cap and the entitlement must never disagree. The memory ENTITLEMENT itself is
 * no longer expressed here — it lives in `MemoryCaps`, because Studio buys memory too.
 */
export const AGENT_CAPS_FREE: BrowserAgentCaps = agentCaps(
    {
        [AgentUsageMetric.ACTIONS]: 25, [AgentUsageMetric.RESEARCH]: 3, [AgentUsageMetric.FILE_OPS]: 3,
        [AgentUsageMetric.ROUTINE_RUNS]: 50, [AgentUsageMetric.QUICK_TOOLS]: 20, [AgentUsageMetric.MEMORY_OPS]: 0,
    },
    { maxBatchRows: 0, maxConcurrentRows: 0, maxSchedules: 0, reasoningAllowed: false },
)

/** Agent Starter — regular use: batch + schedules on, reasoning still off. */
export const AGENT_CAPS_STARTER: BrowserAgentCaps = agentCaps(
    {
        [AgentUsageMetric.ACTIONS]: 400, [AgentUsageMetric.RESEARCH]: 40, [AgentUsageMetric.FILE_OPS]: 50,
        [AgentUsageMetric.ROUTINE_RUNS]: 2000, [AgentUsageMetric.QUICK_TOOLS]: 300, [AgentUsageMetric.MEMORY_OPS]: 2000,
    },
    { maxBatchRows: 200, maxConcurrentRows: 2, maxSchedules: 5, reasoningAllowed: false },
)

/** Agent Pro — reasoning (Opus) on, generous batch (the cheap headline lever). */
export const AGENT_CAPS_PRO: BrowserAgentCaps = agentCaps(
    {
        [AgentUsageMetric.ACTIONS]: 3000, [AgentUsageMetric.RESEARCH]: 300, [AgentUsageMetric.FILE_OPS]: 500,
        [AgentUsageMetric.ROUTINE_RUNS]: 20000, [AgentUsageMetric.QUICK_TOOLS]: 3000, [AgentUsageMetric.MEMORY_OPS]: 10000,
    },
    { maxBatchRows: 1000, maxConcurrentRows: 3, maxSchedules: 20, reasoningAllowed: true },
)

/** Team — Agent Pro caps with higher concurrency/schedules (pooled across the team). */
export const AGENT_CAPS_TEAM: BrowserAgentCaps = agentCaps(
    {
        [AgentUsageMetric.ACTIONS]: 3000, [AgentUsageMetric.RESEARCH]: 300, [AgentUsageMetric.FILE_OPS]: 500,
        [AgentUsageMetric.ROUTINE_RUNS]: 20000, [AgentUsageMetric.QUICK_TOOLS]: 3000, [AgentUsageMetric.MEMORY_OPS]: 10000,
    },
    { maxBatchRows: 1000, maxConcurrentRows: 5, maxSchedules: 40, reasoningAllowed: true },
)

/** Enterprise edition — unlimited by contract (§3.3). */
export const AGENT_CAPS_ENTERPRISE: BrowserAgentCaps = agentCaps(
    {
        [AgentUsageMetric.ACTIONS]: UNLIMITED_CAP, [AgentUsageMetric.RESEARCH]: UNLIMITED_CAP,
        [AgentUsageMetric.FILE_OPS]: UNLIMITED_CAP, [AgentUsageMetric.ROUTINE_RUNS]: UNLIMITED_CAP,
        [AgentUsageMetric.QUICK_TOOLS]: UNLIMITED_CAP, [AgentUsageMetric.MEMORY_OPS]: UNLIMITED_CAP,
    },
    { maxBatchRows: 5000, maxConcurrentRows: 10, maxSchedules: 200, reasoningAllowed: true },
)

export const UpdateActiveFlowsAddonParamsSchema = z.object({
    newActiveFlowsLimit: z.number(),
})
export type UpdateActiveFlowsAddonParams = z.infer<typeof UpdateActiveFlowsAddonParamsSchema>

export const CreateCheckoutSessionParamsSchema = z.object({
    newActiveFlowsLimit: z.number(),
})
export type CreateSubscriptionParams = z.infer<typeof CreateCheckoutSessionParamsSchema>

export const CreateAICreditCheckoutSessionParamsSchema = z.object({
    aiCredits: z.number(),
})
export type CreateAICreditCheckoutSessionParamsSchema = z.infer<typeof CreateAICreditCheckoutSessionParamsSchema>

export const UpdateAICreditsAutoTopUpParamsSchema = z.union([
    z.object({
        state: z.literal(AiCreditsAutoTopUpState.ENABLED),
        minThreshold: z.number(),
        creditsToAdd: z.number(),
        maxMonthlyLimit: Nullable(z.number()),
    }),
    z.object({
        state: z.literal(AiCreditsAutoTopUpState.DISABLED),
    }),
])
export type UpdateAICreditsAutoTopUpParamsSchema = z.infer<typeof UpdateAICreditsAutoTopUpParamsSchema>

export enum PRICE_NAMES {
    AI_CREDITS = 'ai-credit',
    ACTIVE_FLOWS = 'active-flow',
}

export const PRICE_ID_MAP = {
    [PRICE_NAMES.AI_CREDITS]: {
        dev: 'price_1SfgNxKTWXpWeD7hmDBG4YMZ',
        prod: 'price_1Rnj5bKZ0dZRqLEKQx2gwL7s',
    },
    [PRICE_NAMES.ACTIVE_FLOWS]: {
        dev: 'price_1SQbbYQN93Aoq4f8WK2JC4sf',
        prod: 'price_1SQbcvKZ0dZRqLEKHV5UepRx',
    },
}

/**
 * Monthly list price (USD) per billable cloud tier — SUBSCRIPTION_PLANS_PROPOSAL §3. Team tiers are
 * per-seat. These are the launch starting point (§9.4: re-tune from telemetry). The AMOUNT is
 * informational (Stripe holds the authoritative price); it exists so the pricing UI and the plan
 * table cannot drift apart. Free tiers are absent — they are never billed.
 */
export const PLAN_MONTHLY_PRICE_USD: Partial<Record<PlanName, number>> = {
    [PlanName.AGENT_STARTER]: 12,
    [PlanName.AGENT_PRO]: 29,
    [PlanName.STUDIO_STARTER]: 15,
    [PlanName.STUDIO_PRO]: 39,
    [PlanName.COMPLETE_STARTER]: 25,
    [PlanName.COMPLETE_PRO]: 59,
    // Team tiers bill per seat (minimum 3 seats).
    [PlanName.TEAM_AGENT]: 22,
    [PlanName.TEAM_STUDIO]: 28,
    [PlanName.TEAM_COMPLETE]: 45,
}

/** Minimum seats for the seat-based team tiers (§3.2). */
export const TEAM_PLAN_MIN_SEATS = 3

/** The plans that are actually billed through Stripe (Free tiers and the enterprise edition are not). */
export const BILLABLE_PLANS: PlanName[] = Object.keys(PLAN_MONTHLY_PRICE_USD) as PlanName[]

/**
 * Stripe price-id lookup key for a base plan. The IDs themselves are NOT hardcoded here: they are
 * resolved server-side from configuration (`IB_STRIPE_PRICE_<PLAN>`), because they differ per Stripe
 * account/environment and a wrong-but-plausible literal would silently bill the wrong amount. The
 * server fails loudly when a billable plan has no configured price id.
 */
export function stripePriceEnvKeyForPlan(plan: PlanName): string {
    return `STRIPE_PRICE_${plan.toUpperCase()}`
}

export const STANDARD_CLOUD_PLAN: PlatformPlanWithOnlyLimits = {
    plan: 'standard',
    tablesEnabled: true,
    eventStreamingEnabled: false,
    includedAiCredits: 200,
    activeFlowsLimit: 10,
    projectsLimit: 1,
    aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.DISABLED,
    embeddingEnabled: false,
    agentsEnabled: true,
    aiProvidersEnabled: false,
    chatEnabled: false,
    dataManipulationEnabled: false,
    globalConnectionsEnabled: false,
    customRolesEnabled: false,
    environmentsEnabled: false,
    analyticsEnabled: true,
    showPoweredBy: false,
    auditLogEnabled: false,
    manageBlocksEnabled: false,
    manageTemplatesEnabled: false,
    customAppearanceEnabled: false,
    teamProjectsLimit: TeamProjectsLimit.ONE,
    projectRolesEnabled: false,
    apiKeysEnabled: false,
    ssoEnabled: false,
    secretManagersEnabled: false,
    scimEnabled: false,
    dedicatedWorkers: null,
    canary: false,
    customDomainsEnabled: false,
    // Legacy cloud tier predates the two-product packaging: the agent stays OFF unless the
    // product-scope door explicitly enabled it. Behaviour is byte-for-byte what it is today.
    browserAgentEnabled: false,
    agentSharingUnlocked: false,
    agentCaps: null,
    // Same reasoning for memory: a legacy row grants nothing it did not already grant.
    memoryCaps: null,
}

export const OPEN_SOURCE_PLAN: PlatformPlanWithOnlyLimits = {
    tablesEnabled: true,
    embeddingEnabled: false,
    agentsEnabled: true,
    aiProvidersEnabled: true,
    chatEnabled: false,
    dataManipulationEnabled: false,
    globalConnectionsEnabled: false,
    customRolesEnabled: false,
    includedAiCredits: 0,
    environmentsEnabled: false,
    eventStreamingEnabled: false,
    analyticsEnabled: true,
    showPoweredBy: false,
    auditLogEnabled: false,
    manageBlocksEnabled: false,
    manageTemplatesEnabled: false,
    customAppearanceEnabled: false,
    teamProjectsLimit: TeamProjectsLimit.ONE,
    projectRolesEnabled: false,
    apiKeysEnabled: false,
    ssoEnabled: false,
    secretManagersEnabled: false,
    scimEnabled: false,
    stripeCustomerId: undefined,
    stripeSubscriptionId: undefined,
    stripeSubscriptionStatus: undefined,
    aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.DISABLED,
    dedicatedWorkers: null,
    canary: false,
    customDomainsEnabled: false,
    // Self-hosted editions are unmetered: the Enterprise edition ships every capability, unlimited by
    // contract (§3.3), and brings its own AI keys. In COMMUNITY the browser-agent module is not
    // registered at all, so the flag is inert there — no behaviour change for CE.
    browserAgentEnabled: true,
    agentSharingUnlocked: false, // admin-set, not plan-granted
    agentCaps: AGENT_CAPS_ENTERPRISE,
    memoryCaps: MEMORY_CAPS_ENTERPRISE,
}

export const APPSUMO_PLAN = (planName: PlanName): PlatformPlanWithOnlyLimits => ({
    ...STANDARD_CLOUD_PLAN,
    plan: planName,
    eventStreamingEnabled: false,
    activeFlowsLimit: undefined,
})

// ── Cloud subscription tiers (SUBSCRIPTION_PLANS_PROPOSAL §3) ───────────────────────────────────
// Two products under one billing spine: the browser AGENT and INTELLISPER STUDIO (the automation
// platform). Product scope selects the door; tier selects the caps. Each constant is the literal
// entitlement set a plan grants — the Stripe reconciler writes it wholesale, so there is exactly one
// place a tier's meaning is defined.

/** Base shape shared by every cloud tier: the platform capabilities that are on for everyone. */
const CLOUD_TIER_BASE: PlatformPlanWithOnlyLimits = {
    ...STANDARD_CLOUD_PLAN,
    // Studio (automation) capabilities every paying/free cloud tier gets (§5).
    tablesEnabled: true,
    agentsEnabled: true,
    analyticsEnabled: true,
    // Governance/enterprise capabilities stay OFF on individual tiers (§5).
    globalConnectionsEnabled: false,
    projectRolesEnabled: false,
    customRolesEnabled: false,
    auditLogEnabled: false,
    ssoEnabled: false,
    scimEnabled: false,
    secretManagersEnabled: false,
    environmentsEnabled: false,
    customAppearanceEnabled: false,
    eventStreamingEnabled: false,
    apiKeysEnabled: false,
    aiProvidersEnabled: false, // BYO keys is Enterprise-edition only (§5)
    chatEnabled: false,
    teamProjectsLimit: TeamProjectsLimit.ONE,
    browserAgentEnabled: false,
    agentSharingUnlocked: false,
    agentCaps: AGENT_CAPS_NONE,
    // Memory is its own paid door, independent of the agent: a Studio-only tier can open it without
    // opening the agent. Closed in the base so every tier grants it deliberately, never by accident.
    memoryCaps: MEMORY_CAPS_NONE,
}

// ── (a) Agent-only — ProductScope.BROWSER (§3.1a) ───────────────────────────────────────────────
// The agent door. Studio surfaces stay minimal (no active flows granted).

export const AGENT_FREE_PLAN: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    plan: PlanName.AGENT_FREE,
    includedAiCredits: 100,
    activeFlowsLimit: 0,
    projectsLimit: 1,
    browserAgentEnabled: true,
    agentCaps: AGENT_CAPS_FREE,
}

export const AGENT_STARTER_PLAN: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    plan: PlanName.AGENT_STARTER,
    includedAiCredits: 3000,
    activeFlowsLimit: 0,
    projectsLimit: 1,
    browserAgentEnabled: true,
    agentCaps: AGENT_CAPS_STARTER,
    memoryCaps: MEMORY_CAPS_STARTER,
}

export const AGENT_PRO_PLAN: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    plan: PlanName.AGENT_PRO,
    includedAiCredits: 12000,
    activeFlowsLimit: 0,
    projectsLimit: 1,
    chatEnabled: true, // Pro+ gets the platform copilot (§5)
    browserAgentEnabled: true,
    agentCaps: AGENT_CAPS_PRO,
    memoryCaps: MEMORY_CAPS_PRO,
}

// ── (b) Studio-only (the automation side) — ProductScope.BLOCKUNITS (§3.1b) ─────────────────────
// The Studio door. The browser agent is NOT included — but MEMORY is, from Starter up: it is a
// cross-product capability (org + flow memory is shared team knowledge that flows draw on), so it is
// sold on its own paid door rather than as a side-effect of buying the agent.

export const STUDIO_FREE_PLAN: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    plan: PlanName.STUDIO_FREE,
    includedAiCredits: 0, // BYO credits via top-up
    activeFlowsLimit: 2,
    projectsLimit: 1,
    // Free keeps memory OFF, matching AGENT_FREE: memory's COGS (an embedding per remembered fact
    // AND per recall, plus vector storage that persists for the life of the account) accrues forever
    // on accounts that never convert, and "your flows remember" is the first thing a paid tier buys.
    memoryCaps: MEMORY_CAPS_NONE,
}

export const STUDIO_STARTER_PLAN: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    plan: PlanName.STUDIO_STARTER,
    includedAiCredits: 2000,
    activeFlowsLimit: 10,
    projectsLimit: 1,
    memoryCaps: MEMORY_CAPS_STARTER,
}

export const STUDIO_PRO_PLAN: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    plan: PlanName.STUDIO_PRO,
    includedAiCredits: 8000,
    activeFlowsLimit: 40,
    projectsLimit: 3,
    chatEnabled: true, // Pro+ gets the platform copilot (§5)
    // Pro is the team tier (projectsLimit 3): org/flow memory is shared knowledge, so it gets the
    // larger pooled corpus rather than a single user's budget.
    memoryCaps: MEMORY_CAPS_TEAM,
}

// ── (c) Dual / Complete — ProductScope.FULL (§3.1c) ─────────────────────────────────────────────
// Both products, one pooled AI-credit wallet.

/**
 * The free entry for the dual door: both products open at their free caps. Composed from the two
 * free tiers so a change to either can never silently desync the dual entry.
 */
export const COMPLETE_FREE_PLAN: PlatformPlanWithOnlyLimits = {
    ...STUDIO_FREE_PLAN,
    plan: PlanName.COMPLETE_FREE,
    includedAiCredits: AGENT_FREE_PLAN.includedAiCredits,
    browserAgentEnabled: true,
    agentCaps: AGENT_CAPS_FREE,
}

export const COMPLETE_STARTER_PLAN: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    plan: PlanName.COMPLETE_STARTER,
    includedAiCredits: 5000,
    activeFlowsLimit: 10,
    projectsLimit: 1,
    browserAgentEnabled: true,
    agentCaps: AGENT_CAPS_STARTER,
    memoryCaps: MEMORY_CAPS_STARTER,
}

export const COMPLETE_PRO_PLAN: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    plan: PlanName.COMPLETE_PRO,
    includedAiCredits: 20000,
    activeFlowsLimit: 40,
    projectsLimit: 3,
    chatEnabled: true,
    browserAgentEnabled: true,
    agentCaps: AGENT_CAPS_PRO,
    // Dual door at Pro: both products share one memory, so it gets the team-sized corpus.
    memoryCaps: MEMORY_CAPS_TEAM,
}

// ── (d) Cloud team plans (§3.2) — seat-based, with governance flags ─────────────────────────────

/** Team capabilities common to every team tier: RBAC, alerts, pooled projects. */
const TEAM_TIER_BASE: PlatformPlanWithOnlyLimits = {
    ...CLOUD_TIER_BASE,
    projectRolesEnabled: true,
    customRolesEnabled: true,
    globalConnectionsEnabled: true,
    eventStreamingEnabled: true,
    chatEnabled: true,
    teamProjectsLimit: TeamProjectsLimit.UNLIMITED,
}

export const TEAM_AGENT_PLAN: PlatformPlanWithOnlyLimits = {
    ...TEAM_TIER_BASE,
    plan: PlanName.TEAM_AGENT,
    includedAiCredits: 8000,
    activeFlowsLimit: 0,
    projectsLimit: 10,
    globalConnectionsEnabled: false, // Studio-side capability; not granted on the Agent-only team plan
    browserAgentEnabled: true,
    agentCaps: AGENT_CAPS_TEAM,
    memoryCaps: MEMORY_CAPS_TEAM,
}

export const TEAM_STUDIO_PLAN: PlatformPlanWithOnlyLimits = {
    ...TEAM_TIER_BASE,
    plan: PlanName.TEAM_STUDIO,
    includedAiCredits: 6000,
    activeFlowsLimit: 100,
    projectsLimit: 10,
    // Studio team plan: no agent, but org/flow memory is exactly the shared team knowledge this
    // tier exists to serve.
    memoryCaps: MEMORY_CAPS_TEAM,
}

export const TEAM_COMPLETE_PLAN: PlatformPlanWithOnlyLimits = {
    ...TEAM_TIER_BASE,
    plan: PlanName.TEAM_COMPLETE,
    includedAiCredits: 20000,
    activeFlowsLimit: 100,
    projectsLimit: 25,
    auditLogEnabled: true, // Team Complete adds audit logs (§5)
    browserAgentEnabled: true,
    agentCaps: AGENT_CAPS_TEAM,
    memoryCaps: MEMORY_CAPS_TEAM,
}

/**
 * The authoritative tier→entitlements table. The Stripe reconciler and the plan seeder both resolve
 * through this map, so a plan name can never mean two different things in two places.
 */
export const PLAN_LIMITS_BY_NAME: Partial<Record<PlanName, PlatformPlanWithOnlyLimits>> = {
    [PlanName.AGENT_FREE]: AGENT_FREE_PLAN,
    [PlanName.AGENT_STARTER]: AGENT_STARTER_PLAN,
    [PlanName.AGENT_PRO]: AGENT_PRO_PLAN,
    [PlanName.STUDIO_FREE]: STUDIO_FREE_PLAN,
    [PlanName.STUDIO_STARTER]: STUDIO_STARTER_PLAN,
    [PlanName.STUDIO_PRO]: STUDIO_PRO_PLAN,
    [PlanName.COMPLETE_FREE]: COMPLETE_FREE_PLAN,
    [PlanName.COMPLETE_STARTER]: COMPLETE_STARTER_PLAN,
    [PlanName.COMPLETE_PRO]: COMPLETE_PRO_PLAN,
    [PlanName.TEAM_AGENT]: TEAM_AGENT_PLAN,
    [PlanName.TEAM_STUDIO]: TEAM_STUDIO_PLAN,
    [PlanName.TEAM_COMPLETE]: TEAM_COMPLETE_PLAN,
    [PlanName.STANDARD]: STANDARD_CLOUD_PLAN,
}

/** Resolve a plan name to its entitlement set. Unknown/legacy names fall back to the standard tier. */
export function planLimitsForName(plan: string | null | undefined): PlatformPlanWithOnlyLimits {
    if (isNil(plan)) {
        return STANDARD_CLOUD_PLAN
    }
    return PLAN_LIMITS_BY_NAME[plan as PlanName] ?? STANDARD_CLOUD_PLAN
}

export const isCloudPlanButNotEnterprise = (plan?: string | null): boolean => {
    if (isNil(plan)) {
        return false
    }

    return plan === PlanName.STANDARD
}
