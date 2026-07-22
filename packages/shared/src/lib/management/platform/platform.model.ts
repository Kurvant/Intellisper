import { z } from 'zod'
import { BrowserAgentCaps } from '../../browser-agent/file-audit-usage'
import { BaseModelSchema, DateOrString, Nullable } from '../../core/common/base-model'
import { IbId } from '../../core/common/id-generator'
import { FederatedAuthnProviderConfig, FederatedAuthnProviderConfigWithoutSensitiveData } from '../../core/federated-authn'
import { MemoryCaps } from '../../memory/memory-caps'
import { SsoDomainVerification } from './sso-domain-verification'

export type PlatformId = IbId

export enum FilteredBlockBehavior {
    ALLOWED = 'ALLOWED',
    BLOCKED = 'BLOCKED',
}

export enum PlatformUsageMetric {
    AI_CREDITS = 'ai-credits',
    ACTIVE_FLOWS = 'active-flows',
    // Browser-agent metered dimensions (pooled per platform per UTC month). The counters themselves
    // live in `browser_agent_usage_counter`; these identify the metric in quota errors + usage reads.
    AGENT_ACTIONS = 'agent-actions',
    AGENT_RESEARCH = 'agent-research',
    AGENT_FILE_OPS = 'agent-file-ops',
    AGENT_ROUTINE_RUNS = 'agent-routine-runs',
    AGENT_QUICK_TOOLS = 'agent-quick-tools',
    AGENT_MEMORY_OPS = 'agent-memory-ops',
}

export const PlatformUsage = z.object({
    totalAiCreditsUsed: z.number(),
    totalAiCreditsUsedThisMonth: z.number(),
    aiCreditsRemaining: z.number(),
    aiCreditsLimit: z.number(),
    activeFlows: z.number(),
})

export type PlatformUsage = z.infer<typeof PlatformUsage>

export enum PlanName {
    STANDARD = 'standard',
    ENTERPRISE = 'enterprise',
    INTERNAL = 'internal',
    APPSUMO_INTELLISPER_TIER1 = 'appsumo_intellisper_tier1',
    APPSUMO_INTELLISPER_TIER2 = 'appsumo_intellisper_tier2',
    APPSUMO_INTELLISPER_TIER3 = 'appsumo_intellisper_tier3',
    APPSUMO_INTELLISPER_TIER4 = 'appsumo_intellisper_tier4',
    APPSUMO_INTELLISPER_TIER5 = 'appsumo_intellisper_tier5',
    APPSUMO_INTELLISPER_TIER6 = 'appsumo_intellisper_tier6',

    // ── Subscription-plan rollout (SUBSCRIPTION_PLANS_PROPOSAL §3) ───────────────────────────────
    // Two products, one billing spine: the browser AGENT (Routines, batch/schedule) and the
    // automation platform, "Intellisper STUDIO" (visual workflows across ~800 apps). A plan's
    // product scope selects which doors it opens; its tier selects the caps.
    // Agent-only (ProductScope.BROWSER)
    AGENT_FREE = 'agent_free',
    AGENT_STARTER = 'agent_starter',
    AGENT_PRO = 'agent_pro',
    // Studio-only, the automation side (ProductScope.BLOCKUNITS)
    STUDIO_FREE = 'studio_free',
    STUDIO_STARTER = 'studio_starter',
    STUDIO_PRO = 'studio_pro',
    // Dual / Complete (ProductScope.FULL)
    COMPLETE_FREE = 'complete_free',
    COMPLETE_STARTER = 'complete_starter',
    COMPLETE_PRO = 'complete_pro',
    // Cloud team plans (self-serve, seat-based)
    TEAM_AGENT = 'team_agent',
    TEAM_STUDIO = 'team_studio',
    TEAM_COMPLETE = 'team_complete',
}

export enum TeamProjectsLimit {
    NONE = 'NONE',
    ONE = 'ONE',
    UNLIMITED = 'UNLIMITED',
}

export enum AiCreditsAutoTopUpState {
    ENABLED = 'enabled',
    DISABLED = 'disabled',
}

export const PlatformPlan = z.object({
    ...BaseModelSchema,
    // TODO: We have to use the enum when we finalize the plan names
    plan: Nullable(z.string()),
    platformId: z.string(),
    includedAiCredits: z.number(),
    lastFreeAiCreditsRenewalDate: Nullable(DateOrString),

    tablesEnabled: z.boolean(),
    eventStreamingEnabled: z.boolean(),
    aiCreditsAutoTopUpState: z.nativeEnum(AiCreditsAutoTopUpState),
    aiCreditsAutoTopUpThreshold: Nullable(z.number()),
    aiCreditsAutoTopUpCreditsToAdd: Nullable(z.number()),
    maxAutoTopUpCreditsMonthly: Nullable(z.number()),

    environmentsEnabled: z.boolean(),
    analyticsEnabled: z.boolean(),
    showPoweredBy: z.boolean(),
    auditLogEnabled: z.boolean(),
    embeddingEnabled: z.boolean(),
    agentsEnabled: z.boolean(),
    aiProvidersEnabled: z.boolean(),
    chatEnabled: z.boolean(),
    dataManipulationEnabled: z.boolean(),
    manageBlocksEnabled: z.boolean(),
    manageTemplatesEnabled: z.boolean(),
    customAppearanceEnabled: z.boolean(),
    teamProjectsLimit: z.nativeEnum(TeamProjectsLimit),
    projectRolesEnabled: z.boolean(),
    globalConnectionsEnabled: z.boolean(),
    customRolesEnabled: z.boolean(),
    apiKeysEnabled: z.boolean(),
    ssoEnabled: z.boolean(),
    secretManagersEnabled: z.boolean(),
    scimEnabled: z.boolean(),
    licenseKey: Nullable(z.string()),
    licenseExpiresAt: Nullable(DateOrString),
    stripeCustomerId: Nullable(z.string()),
    stripeSubscriptionId: Nullable(z.string()),
    stripeSubscriptionStatus: Nullable(z.string()),
    stripeSubscriptionStartDate: Nullable(z.number()),
    stripeSubscriptionEndDate: Nullable(z.number()),
    stripeSubscriptionCancelDate: Nullable(z.number()),

    projectsLimit: Nullable(z.number()),
    activeFlowsLimit: Nullable(z.number()),

    // ── Browser-agent entitlements (SUBSCRIPTION_PLANS_PROPOSAL §8, Option 1: promoted into the
    // plan so ONE row is the single source of truth for both products). These columns already
    // existed in the DB as agent-only flags; they are now surfaced on the shared contract so the
    // Stripe reconciler sets them like any other limit and the frontend can gate/display them.
    /** Whether the browser-agent product is unlocked for this platform (product-scope door). */
    browserAgentEnabled: z.boolean(),
    /** Admin switch: allows members to opt IN to sharing their agent data (memory stays private). */
    agentSharingUnlocked: z.boolean(),
    /**
     * The platform's browser-agent caps, stored as one jsonb blob so a plan change is atomic.
     * `null` on rows not yet migrated to a new tier — the resolver falls back to a safe default.
     */
    agentCaps: Nullable(BrowserAgentCaps),

    /**
     * MEMORY entitlement — its own blob, independent of `browserAgentEnabled`/`agentCaps`, because
     * memory is sold and used by EITHER product (agent → personal memory, Studio → org/flow memory).
     * A Studio-only plan sets this and nothing agent-related.
     * `null` = no memory on this plan; the resolver treats it as closed (fail-closed).
     */
    memoryCaps: Nullable(MemoryCaps),

    /** @deprecated use workerGroupId instead — will be removed in 0.83.0 */
    dedicatedWorkers: Nullable(z.object({
        trustedEnvironment: z.boolean(),
    })),
    /** @deprecated use workerGroupId instead — will be removed in 0.83.0 */
    canary: z.boolean(),
    /** @deprecated custom domains have been removed; column kept for backwards compatibility with existing DBs */
    customDomainsEnabled: z.boolean(),
    workerGroupId: Nullable(z.string()),
})
export type PlatformPlan = z.infer<typeof PlatformPlan>

export const PlatformPlanLimits = PlatformPlan.omit({ id: true, platformId: true, created: true, updated: true })
export type PlatformPlanLimits = z.infer<typeof PlatformPlanLimits>
export type PlatformPlanWithOnlyLimits = Omit<PlatformPlanLimits, 'stripeSubscriptionStartDate' | 'stripeSubscriptionEndDate' | 'stripeBillingCycle'>

export const Platform = z.object({
    ...BaseModelSchema,
    ownerId: IbId,
    name: z.string(),
    primaryColor: z.string(),
    logoIconUrl: z.string(),
    fullLogoUrl: z.string(),
    favIconUrl: z.string(),
    /**
    * @deprecated Use projects filter instead.
    */
    filteredBlockNames: z.array(z.string()),
    /**
    * @deprecated Use projects filter instead.
    */
    filteredBlockBehavior: z.nativeEnum(FilteredBlockBehavior),
    cloudAuthEnabled: z.boolean(),
    googleAuthEnabled: z.boolean(),
    enforceAllowedAuthDomains: z.boolean(),
    allowedAuthDomains: z.array(z.string()),
    allowedEmbedOrigins: z.array(z.string()),
    ssoDomain: Nullable(z.string()),
    ssoDomainVerification: Nullable(SsoDomainVerification),
    federatedAuthProviders: FederatedAuthnProviderConfig,
    emailAuthEnabled: z.boolean(),
    pinnedBlocks: z.array(z.string()),
})
export type Platform = z.infer<typeof Platform>
export type PlatformWithoutFederatedAuth = Omit<Platform, 'federatedAuthProviders'>

export const PlatformWithoutSensitiveData = z.object({
    federatedAuthProviders: Nullable(FederatedAuthnProviderConfigWithoutSensitiveData),
    plan: PlatformPlanLimits,
    usage: PlatformUsage.optional(),
    id: z.string(),
    created: DateOrString,
    updated: DateOrString,
    ownerId: IbId,
    name: z.string(),
    primaryColor: z.string(),
    logoIconUrl: z.string(),
    fullLogoUrl: z.string(),
    favIconUrl: z.string(),
    filteredBlockNames: z.array(z.string()),
    filteredBlockBehavior: z.nativeEnum(FilteredBlockBehavior),
    cloudAuthEnabled: z.boolean(),
    googleAuthEnabled: z.boolean(),
    enforceAllowedAuthDomains: z.boolean(),
    allowedAuthDomains: z.array(z.string()),
    allowedEmbedOrigins: z.array(z.string()),
    ssoDomain: Nullable(z.string()),
    ssoDomainVerification: Nullable(SsoDomainVerification),
    emailAuthEnabled: z.boolean(),
    pinnedBlocks: z.array(z.string()),
})
export type PlatformWithoutSensitiveData = z.infer<typeof PlatformWithoutSensitiveData>

export const PlatformBillingInformation = z.object({
    plan: PlatformPlan,
    usage: PlatformUsage,
    nextBillingDate: z.number(),
    nextBillingAmount: z.number(),
    cancelAt: Nullable(z.number()),
})
export type PlatformBillingInformation = z.infer<typeof PlatformBillingInformation>
