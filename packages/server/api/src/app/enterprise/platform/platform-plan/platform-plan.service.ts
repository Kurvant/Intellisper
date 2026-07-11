// Clean-room implementation — per-organization plan / entitlement record and the
// entitlement + quota engine (capability spec I.7a, I.7b, G.3, G.4).
//
// One plan row per platform (organization). The row is the authoritative source of
// what an organization is entitled to: capability flags + numeric limits, plus
// optional commercial state (tier label, subscription references/dates, AI-credit
// top-up state). It is created lazily on first demand, seeded by edition, under a
// mutual-exclusion guard so concurrent first-access cannot create duplicates.
//
// COMMUNITY note: the base platform service (app/platform/platform.service.ts) never
// calls this service in community — it short-circuits to OPEN_SOURCE_PLAN / undefined
// usage. These methods are reached only in ENTERPRISE/CLOUD.
import { ibDayjs } from '@intelblocks/server-utils'
import {
    IntellisperError,
    IbEdition,
    ibId,
    ErrorCode,
    FlowStatus,
    isCloudPlanButNotEnterprise,
    isNil,
    OPEN_SOURCE_PLAN,
    PlatformPlan,
    PlatformPlanLimits,
    PlatformPlanWithOnlyLimits,
    PlatformUsage,
    PlatformUsageMetric,
    STANDARD_CLOUD_PLAN,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../../core/db/repo-factory'
import { getPlatformPlanNameKey } from '../../../database/redis/keys'
import { distributedLock, distributedStore } from '../../../database/redis-connections'
import { flowRepo } from '../../../flows/flow/flow.repo'
import { system } from '../../../helper/system/system'
import { platformService } from '../../../platform/platform.service'
import { platformAiCreditsService } from './platform-ai-credits.service'
import { PlatformPlanEntity } from './platform-plan.entity'

export const platformPlanRepo = repoFactory(PlatformPlanEntity)

const edition = system.getEdition()

export const platformPlanService = (log: FastifyBaseLogger) => ({

    // Return the organization's plan record, creating it lazily (edition-seeded) if it
    // does not yet exist. A double-checked lock prevents two concurrent first-callers
    // from both inserting (the unique index would otherwise reject the loser).
    async getOrCreateForPlatform(platformId: string): Promise<PlatformPlan> {
        const existing = await platformPlanRepo().findOneBy({ platformId })
        if (!isNil(existing)) {
            return existing
        }

        return distributedLock(log).runExclusive({
            key: `platform_plan_${platformId}`,
            timeoutInSeconds: 60,
            fn: async () => {
                const afterLock = await platformPlanRepo().findOneBy({ platformId })
                if (!isNil(afterLock)) {
                    return afterLock
                }
                return createInitialPlan(platformId, log)
            },
        })
    },

    // Apply a partial change to the plan record. Any change to the tier label is
    // mirrored into the distributed store so read-path consumers that resolve the
    // tier by key never honor a stale value (I.7a cache-coherence).
    async update(params: UpdatePlatformPlanParams): Promise<PlatformPlan> {
        const { platformId, ...update } = params
        const existing = await platformPlanRepo().findOneByOrFail({ platformId })

        // Normalize `undefined` inputs to `null` so an explicit clear persists rather
        // than being dropped by the object spread.
        const normalized = Object.fromEntries(
            Object.entries(update).map(([key, value]) => [key, value === undefined ? null : value]),
        )

        const saved = await platformPlanRepo().save({ ...existing, ...normalized })
        if (!isNil(saved.plan)) {
            await distributedStore.put(getPlatformPlanNameKey(platformId), saved.plan)
        }
        return saved
    },

    // The live usage snapshot: currently-enabled automations across the organization's
    // projects, plus AI-credit usage (delegated to the credits service). This snapshot
    // feeds both quota enforcement and the administrative billing/usage reads.
    async getUsage(platformId: string): Promise<PlatformUsage> {
        const activeFlows = await countActiveFlows(platformId)
        const aiCredits = await platformAiCreditsService(log).getUsage(platformId)
        return {
            activeFlows,
            aiCreditsLimit: aiCredits.limit,
            aiCreditsRemaining: aiCredits.usageRemaining,
            totalAiCreditsUsed: aiCredits.usage,
            totalAiCreditsUsedThisMonth: aiCredits.usageMonthly,
        }
    },

    // Pre-action quota gate for the active-flows limit. A no-op in the unmetered
    // community edition; in metered editions it compares live usage to the plan limit
    // and denies with a quota-exceeded error when the cap is met. Fail-safe: a null
    // limit means "unlimited" (no denial), never "zero".
    async checkActiveFlowsExceededLimit(platformId: string, metric: PlatformUsageMetric): Promise<void> {
        if (edition === IbEdition.COMMUNITY) {
            return
        }
        const plan = await this.getOrCreateForPlatform(platformId)
        if (isNil(plan.activeFlowsLimit)) {
            return
        }
        const activeFlows = await countActiveFlows(platformId)
        if (activeFlows >= plan.activeFlowsLimit) {
            throw new IntellisperError({
                code: ErrorCode.QUOTA_EXCEEDED,
                params: { metric },
            })
        }
    },

    // Whether the organization is on a paid-but-not-enterprise cloud tier (used, e.g.,
    // to gate self-serve platform deletion).
    async isCloudNonEnterprisePlan(platformId: string): Promise<boolean> {
        const plan = await this.getOrCreateForPlatform(platformId)
        return isCloudPlanButNotEnterprise(plan.plan)
    },
})

// Count of currently-enabled automations across all of the organization's projects.
async function countActiveFlows(platformId: string): Promise<number> {
    return flowRepo()
        .createQueryBuilder('flow')
        .innerJoin('project', 'project', 'project.id = flow."projectId"')
        .where('project."platformId" = :platformId', { platformId })
        .andWhere('flow.status = :status', { status: FlowStatus.ENABLED })
        .getCount()
}

// The entitlement set a fresh organization starts with, chosen by edition: self-hosted
// editions are unmetered and seed the open/full-local set; the managed cloud seeds the
// standard commercial default.
function seedPlanByEdition(): PlatformPlanWithOnlyLimits {
    switch (edition) {
        case IbEdition.CLOUD:
            return STANDARD_CLOUD_PLAN
        case IbEdition.ENTERPRISE:
        case IbEdition.COMMUNITY:
        default:
            return OPEN_SOURCE_PLAN
    }
}

async function createInitialPlan(platformId: string, log: FastifyBaseLogger): Promise<PlatformPlan> {
    // Ensure the organization exists before pricing it (owner is needed for cloud
    // billing-customer creation).
    await platformService(log).getOneOrThrow(platformId)

    const seed = seedPlanByEdition()
    const now = ibDayjs()

    const record: Omit<PlatformPlan, 'created' | 'updated'> = {
        ...seed,
        id: ibId(),
        platformId,
        // Commercial defaults; a real subscription overwrites these via webhook
        // reconciliation. Absent a subscription the billing period is the calendar
        // month.
        stripeSubscriptionStartDate: now.startOf('month').unix(),
        stripeSubscriptionEndDate: now.endOf('month').unix(),
        stripeSubscriptionCancelDate: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        aiCreditsAutoTopUpThreshold: null,
        aiCreditsAutoTopUpCreditsToAdd: null,
        maxAutoTopUpCreditsMonthly: null,
        lastFreeAiCreditsRenewalDate: null,
        licenseKey: null,
        licenseExpiresAt: null,
        projectsLimit: seed.projectsLimit ?? null,
        activeFlowsLimit: seed.activeFlowsLimit ?? null,
        workerGroupId: null,
    }

    const saved = await platformPlanRepo().save(record)
    if (!isNil(saved.plan)) {
        await distributedStore.put(getPlatformPlanNameKey(platformId), saved.plan)
    }
    return saved
}

type UpdatePlatformPlanParams = {
    platformId: string
} & Partial<PlatformPlanLimits>
