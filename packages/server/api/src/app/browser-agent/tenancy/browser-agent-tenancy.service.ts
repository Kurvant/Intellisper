import {
    AGENT_FREE_PLAN,
    COMPLETE_FREE_PLAN,
    ErrorCode,
    IntellisperError,
    isNil,
    type PlatformPlanWithOnlyLimits,
    ProductScope,
    productScopeIncludesBrowserAgent,
    STUDIO_FREE_PLAN,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../../database/database-connection'
import { getPlatformPlanNameKey } from '../../database/redis/keys'
import { distributedStore } from '../../database/redis-connections'
import { platformPlanService } from '../../enterprise/platform/platform-plan/platform-plan.service'

/**
 * The free tier a new platform starts on, chosen by the product-scope door the customer entered
 * (SUBSCRIPTION_PLANS_PROPOSAL §3). Returns null when there is no scope — a stock platform keeps its
 * edition default and is not touched.
 *
 * FULL's free entry is the union of the two free tiers: the Agent door open with Agent-Free caps,
 * plus Studio-Free's active flows. It is deliberately composed from the two constants rather than
 * duplicated, so a change to either free tier cannot silently desync the dual entry.
 */
function defaultFreePlanForScope(scope: ProductScope | null | undefined): PlatformPlanWithOnlyLimits | null {
    if (isNil(scope)) {
        return null
    }
    switch (scope) {
        case ProductScope.BROWSER:
            return AGENT_FREE_PLAN
        case ProductScope.BLOCKUNITS:
            return STUDIO_FREE_PLAN
        case ProductScope.FULL:
            return COMPLETE_FREE_PLAN
        default:
            return null
    }
}

/**
 * Browser-agent tenancy rules layered ON TOP of blockunits' native auth/platform model, without
 * touching its shared `PlatformPlan` contract. The two browser-agent flags
 * (`browserAgentEnabled`, `agentSharingUnlocked`) live only in the DB (added by the Phase-1
 * migration) and are read/written here via scoped raw SQL — so blockunits' plan/billing types and
 * defaults are completely unaffected.
 *
 * Rules:
 *  - PRODUCT SCOPE: a platform created for BROWSER/FULL gets `browserAgentEnabled = true`.
 *    BLOCKUNITS (or absent) leaves it false → a stock blockunits platform. Fully additive.
 *  - ONE PLATFORM PER EMAIL (browser agent only): an identity may own AT MOST ONE
 *    browser-agent-enabled platform. This intentionally CONSTRAINS blockunits' native
 *    multi-platform-per-identity allowance, but ONLY for the browser-agent product — pure
 *    blockunits users keep multi-platform behavior untouched.
 */
export const browserAgentTenancyService = (log: FastifyBaseLogger) => ({
    /**
     * Guard invoked BEFORE creating a browser-agent platform for an identity. Throws when the
     * identity already owns a browser-agent-enabled platform (one-per-email). No-op for
     * non-browser-agent scopes, so blockunits platform creation is never affected.
     */
    async assertCanCreateBrowserAgentPlatform(params: {
        identityId: string
        productScope: ProductScope | null | undefined
    }): Promise<void> {
        if (!productScopeIncludesBrowserAgent(params.productScope)) {
            return
        }
        const existing = await this.countBrowserAgentPlatformsForIdentity(params.identityId)
        if (existing > 0) {
            log.info({ identityId: params.identityId }, '[browserAgentTenancy] refused second browser-agent platform (one-per-email)')
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: {
                    message: 'This account already has an Intellisper browser-agent workspace. Only one is allowed per account.',
                },
            })
        }
    },

    /**
     * Apply the product scope to a freshly-created platform: seed the FREE tier for the door the
     * customer came through (SUBSCRIPTION_PLANS_PROPOSAL §7.7). The scope is the packaging axis —
     * BROWSER → Agent Free, BLOCKUNITS → Studio Free, FULL → both (Complete's free entry = Agent
     * Free caps + Studio Free flows).
     *
     * Writes the whole entitlement set in ONE statement so a platform can never end up half-seeded
     * (agent enabled but no caps, or caps without the door open). Idempotent: re-applying the same
     * scope yields the same row. A platform on a PAID plan is never downgraded by this — it only
     * seeds a platform still on its edition default (guarded by the plan-name check below).
     */
    async applyProductScope(params: { platformId: string, productScope: ProductScope | null | undefined }): Promise<void> {
        const scope = params.productScope
        const seed = defaultFreePlanForScope(scope)
        if (!seed) {
            // No scope (or an unrecognised one) → leave the platform on its edition default. A stock
            // blockunits platform is completely unaffected.
            return
        }
        // A freshly-created platform has no plan row yet (plans are created lazily), and the UPDATE
        // below would silently match zero rows and leave the platform unscoped. Materialize the row
        // first so there is always something to seed.
        await platformPlanService(log).getOrCreateForPlatform(params.platformId)
        // Only seed a platform that is still on an edition default / free tier. Never clobber a paid
        // plan (a re-run of signup-time scoping must not wipe a subscription's entitlements).
        await databaseConnection().query(
            `UPDATE "platform_plan"
                SET "plan" = $2,
                    "browserAgentEnabled" = $3,
                    "agentCaps" = $4::jsonb,
                    "includedAiCredits" = $5,
                    "activeFlowsLimit" = $6,
                    "projectsLimit" = $7
              WHERE "platformId" = $1
                AND (COALESCE("plan", '') = '' OR "plan" IN ('standard', 'agent_free', 'studio_free', 'complete_free'))`,
            [
                params.platformId,
                seed.plan,
                seed.browserAgentEnabled,
                seed.agentCaps === null ? null : JSON.stringify(seed.agentCaps),
                seed.includedAiCredits,
                seed.activeFlowsLimit ?? null,
                seed.projectsLimit ?? null,
            ],
        )
        // Mirror the tier label into the distributed store, matching platformPlanService#update. The
        // raw UPDATE above bypasses it, and read-path consumers (rate limiter) resolve the tier from
        // this key — without the refresh they would honor the edition default seeded on create.
        await distributedStore.put(getPlatformPlanNameKey(params.platformId), seed.plan)
        log.info({ platformId: params.platformId, productScope: scope, plan: seed.plan }, '[browserAgentTenancy] seeded product-scope free tier')
    },

    /** How many browser-agent-enabled platforms this identity owns (via its user rows). */
    async countBrowserAgentPlatformsForIdentity(identityId: string): Promise<number> {
        const rows: Array<{ count: string }> = await databaseConnection().query(
            `SELECT COUNT(DISTINCT pp."platformId") AS count
             FROM "platform_plan" pp
             JOIN "user" u ON u."platformId" = pp."platformId"
             WHERE u."identityId" = $1 AND pp."browserAgentEnabled" = true`,
            [identityId],
        )
        return Number(rows[0]?.count ?? 0)
    },

    /** Is the browser agent enabled on this platform? (feature gate for controllers.) */
    async isBrowserAgentEnabled(platformId: string): Promise<boolean> {
        const rows: Array<{ browserAgentEnabled: boolean }> = await databaseConnection().query(
            'SELECT "browserAgentEnabled" FROM "platform_plan" WHERE "platformId" = $1 LIMIT 1',
            [platformId],
        )
        return rows[0]?.browserAgentEnabled === true
    },

    /** Is platform sharing unlocked by the admin? (feeds AgentVisibilityContext.sharingUnlocked.) */
    async isSharingUnlocked(platformId: string): Promise<boolean> {
        const rows: Array<{ agentSharingUnlocked: boolean }> = await databaseConnection().query(
            'SELECT "agentSharingUnlocked" FROM "platform_plan" WHERE "platformId" = $1 LIMIT 1',
            [platformId],
        )
        return rows[0]?.agentSharingUnlocked === true
    },

    /**
     * Find the browser-agent platform an identity currently owns (at most one, by the one-per-email
     * rule), or null. Used by the invite-collision resolution to locate the "personal" workspace.
     */
    async findBrowserAgentPlatformForIdentity(identityId: string): Promise<{ platformId: string, userId: string } | null> {
        const rows: Array<{ platformId: string, userId: string }> = await databaseConnection().query(
            `SELECT pp."platformId" AS "platformId", u."id" AS "userId"
             FROM "platform_plan" pp
             JOIN "user" u ON u."platformId" = pp."platformId"
             WHERE u."identityId" = $1 AND pp."browserAgentEnabled" = true
             LIMIT 1`,
            [identityId],
        )
        const row = rows[0]
        return row ? { platformId: row.platformId, userId: row.userId } : null
    },

    /**
     * Resolve an invite collision — the user owns a personal browser-agent platform and is joining a
     * team. All operations are strictly scoped to the (source personal userId, source platformId);
     * no other account's data is ever touched.
     *
     *  - 'transfer' : re-home the user's browser-agent data (owned by their personal user row on the
     *                 personal platform) onto their user row on the TARGET team platform, then
     *                 disable the browser agent on the personal platform. Requires the user to have
     *                 a user row on the target platform (they must have accepted the invite first).
     *  - 'abandon'  : hard-remove the user's personal browser-agent data + disable the browser agent
     *                 on the personal platform. Non-destructive to any other platform/account.
     *  - 'decline'  : no-op (keep both).
     *
     * Runs in one transaction so a partial move can never split a user's data across platforms.
     */
    async resolvePersonalPlatformCollision(params: {
        identityId: string
        action: 'transfer' | 'abandon' | 'decline'
        targetPlatformId?: string
    }): Promise<{ moved: number, action: string }> {
        if (params.action === 'decline') {
            return { moved: 0, action: 'decline' }
        }
        const personal = await this.findBrowserAgentPlatformForIdentity(params.identityId)
        if (!personal) {
            return { moved: 0, action: params.action }
        }

        return databaseConnection().transaction(async (em) => {
            let moved = 0
            if (params.action === 'transfer') {
                const targetPlatformId = params.targetPlatformId
                if (isNilString(targetPlatformId)) {
                    throw new IntellisperError({
                        code: ErrorCode.VALIDATION,
                        params: { message: 'A target platform is required to transfer your browser-agent workspace.' },
                    })
                }
                if (targetPlatformId === personal.platformId) {
                    throw new IntellisperError({
                        code: ErrorCode.VALIDATION,
                        params: { message: 'The target platform is the same as your personal workspace.' },
                    })
                }
                // The acting user's row on the TARGET platform (must exist — accept the invite first).
                const targetUserRows: Array<{ id: string }> = await em.query(
                    `SELECT u."id" FROM "user" u
                     WHERE u."identityId" = $1 AND u."platformId" = $2 LIMIT 1`,
                    [params.identityId, targetPlatformId],
                )
                const targetUserId = targetUserRows[0]?.id
                if (isNilString(targetUserId)) {
                    throw new IntellisperError({
                        code: ErrorCode.AUTHORIZATION,
                        params: { message: 'You must join the target workspace before transferring your browser-agent data to it.' },
                    })
                }
                // Re-home every browser-agent table's rows owned by (personal.userId, personal.platformId)
                // onto (targetUserId, targetPlatformId). Scoped by BOTH old owner + old platform.
                for (const table of OWNER_SCOPED_AGENT_TABLES) {
                    const res = await em.query(
                        `UPDATE "${table}" SET "userId" = $1, "platformId" = $2
                         WHERE "userId" = $3 AND "platformId" = $4`,
                        [targetUserId, targetPlatformId, personal.userId, personal.platformId],
                    )
                    moved += rowCount(res)
                }
            }
            else {
                // abandon: delete the user's personal browser-agent data (owner-scoped, this platform).
                for (const table of OWNER_SCOPED_AGENT_TABLES) {
                    const res = await em.query(
                        `DELETE FROM "${table}" WHERE "userId" = $1 AND "platformId" = $2`,
                        [personal.userId, personal.platformId],
                    )
                    moved += rowCount(res)
                }
            }
            // Either way, the personal platform is no longer a browser-agent workspace.
            await em.query(
                'UPDATE "platform_plan" SET "browserAgentEnabled" = false WHERE "platformId" = $1',
                [personal.platformId],
            )
            log.info({ identityId: params.identityId, action: params.action, moved }, '[browserAgentTenancy] resolved personal-platform collision')
            return { moved, action: params.action }
        })
    },
})

function isNilString(v: string | undefined | null): v is undefined | null {
    return v === undefined || v === null || v === ''
}

function rowCount(result: unknown): number {
    // pg driver returns [rows, affected] for UPDATE/DELETE via query(); affected is the 2nd element.
    if (Array.isArray(result) && typeof result[1] === 'number') return result[1]
    return 0
}

/**
 * The browser-agent tables whose rows are directly owner-scoped by (userId, platformId) and thus
 * moved/removed on a personal-platform collision resolution. Child rows (message/action/step) follow
 * their parent via ON DELETE CASCADE, and on transfer they ride their parent (their platformId is
 * inherited through the parent), so only the top-level owner-scoped tables are enumerated here.
 */
const OWNER_SCOPED_AGENT_TABLES = [
    'browser_agent_conversation',
    'browser_agent_run',
    'browser_agent_memory_fact',
    'browser_agent_memory_entity',
    'browser_agent_memory_relation',
    'browser_agent_routine',
    'browser_agent_routine_run',
    'browser_agent_batch_job',
    'browser_agent_schedule',
    'browser_agent_file',
    'browser_agent_audit_log',
] as const
