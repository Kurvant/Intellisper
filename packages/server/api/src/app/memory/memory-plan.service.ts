import {
    ErrorCode,
    IntellisperError,
    MEMORY_CAPS_NONE,
    MEMORY_UNLIMITED_CAP,
    type MemoryCaps,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../database/database-connection'

/**
 * memoryPlan — the single seam resolving a platform's MEMORY entitlement.
 *
 * It reads `platform_plan.memoryCaps` and DELIBERATELY never looks at `browserAgentEnabled`. That
 * omission is the whole point: memory is a cross-product capability (agent → personal memory,
 * Studio → org/flow memory), so a Studio-only platform must be able to buy and use it with no agent.
 * Consulting the agent door here would reintroduce the coupling this module exists to remove.
 *
 * SAFETY — it separates a RESOLVED answer from a FAILURE to resolve, matching `browserAgentPlan`:
 *  - Resolved "no memoryCaps" / no plan row / malformed blob → MEMORY_CAPS_NONE (deny). These are
 *    real answers: the platform genuinely has no entitlement.
 *  - FAILED to resolve (DB fault) → also denied, because memory is a PRIVILEGE and privileges fail
 *    CLOSED. Nothing is lost: facts are retained, reads resume when the fault clears. Granting on a
 *    fault would hand a free plan a paid capability.
 */

export const memoryPlan = (log: FastifyBaseLogger) => ({
    async capsForPlatform({ platformId }: { platformId: string }): Promise<MemoryCaps> {
        try {
            const rows: PlanMemoryRow[] = await databaseConnection().query(
                'SELECT "memoryCaps" FROM "platform_plan" WHERE "platformId" = $1',
                [platformId],
            )
            const row = rows[0]
            if (!row || !isValidMemoryCaps(row.memoryCaps)) {
                return MEMORY_CAPS_NONE
            }
            return row.memoryCaps
        }
        catch (err) {
            log.warn(
                { err: (err as Error).message, platformId },
                '[memoryPlan] caps resolve failed — denying (privileges fail closed)',
            )
            return MEMORY_CAPS_NONE
        }
    },

    async isEnabled({ platformId }: { platformId: string }): Promise<boolean> {
        const caps = await this.capsForPlatform({ platformId })
        return caps.enabled
    },

    /**
     * Assert the plan includes memory, or reject with an upgrade prompt. Used by the memory routes —
     * write AND read paths, since a plan without memory must not serve a corpus it does not pay for
     * (the facts are retained, not destroyed; an upgrade restores access intact).
     */
    async assertEnabled({ platformId }: { platformId: string }): Promise<void> {
        if (!(await this.isEnabled({ platformId }))) {
            throw new IntellisperError({
                code: ErrorCode.FEATURE_DISABLED,
                params: { message: 'Memory is not included on your plan. Upgrade to let your agent and your flows remember across tasks.' },
            })
        }
    },

    /**
     * Is this user under the plan's stored-fact ceiling? Checked before a NEW fact is inserted only —
     * edits and deletes stay allowed, so a user at the ceiling can still curate what they already
     * have rather than being frozen out of their own memory.
     */
    async canStoreMoreFacts({ platformId, userId }: { platformId: string, userId: string }): Promise<{ allowed: boolean, used: number, limit: number }> {
        const caps = await this.capsForPlatform({ platformId })
        if (!caps.enabled) {
            return { allowed: false, used: 0, limit: 0 }
        }
        if (caps.maxFacts === MEMORY_UNLIMITED_CAP) {
            return { allowed: true, used: 0, limit: caps.maxFacts }
        }
        const rows: Array<{ used: number }> = await databaseConnection().query(
            `SELECT COUNT(*)::int AS used FROM browser_agent_memory_fact
             WHERE "platformId" = $1 AND "userId" = $2 AND "deletedAt" IS NULL`,
            [platformId, userId],
        )
        const used = rows[0]?.used ?? 0
        return { allowed: used < caps.maxFacts, used, limit: caps.maxFacts }
    },
})

/**
 * Validate a persisted blob before trusting it. A row written by an older/newer shape (or by hand)
 * must never grant a capability implicitly — anything unrecognised is denied.
 */
function isValidMemoryCaps(caps: unknown): caps is MemoryCaps {
    if (caps === null || typeof caps !== 'object') {
        return false
    }
    const candidate = caps as Partial<MemoryCaps>
    if (typeof candidate.enabled !== 'boolean' || typeof candidate.maxFacts !== 'number') {
        return false
    }
    if (typeof candidate.monthlyOps !== 'number') {
        return false
    }
    return candidate.recallTier === 'free' || candidate.recallTier === 'pro' || candidate.recallTier === 'enterprise'
}

type PlanMemoryRow = {
    memoryCaps: MemoryCaps | null
}
