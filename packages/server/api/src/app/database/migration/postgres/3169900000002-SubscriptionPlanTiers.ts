import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

/**
 * Subscription-plan rollout (SUBSCRIPTION_PLANS_PROPOSAL §7.2): promote the browser-agent
 * entitlement caps INTO `platform_plan` so one plan row is the single source of truth for both
 * products (the browser Agent and Intellisper Studio).
 *
 * Additive + idempotent:
 *  - `browserAgentEnabled` / `agentSharingUnlocked` already exist (browser-agent Phase-1 migration);
 *    the ADD COLUMN IF NOT EXISTS keeps this migration safe on a DB where they're absent.
 *  - `agentCaps` (jsonb) is new: the whole BrowserAgentCaps set in one column, so a tier change is
 *    written atomically and can never drift across columns.
 *
 * BACKWARD COMPATIBILITY — the backfill below reproduces, exactly, the behaviour existing platforms
 * have TODAY. Before this migration the caps resolver derived a tier from the plan NAME:
 *   agent disabled → nothing; 'enterprise' → enterprise; 'team' → team; 'pro'/'complete' → pro;
 *   'starter'/'standard'/'midi' → starter; otherwise → free.
 * The backfill materialises that same decision into `agentCaps`, so no platform's entitlements
 * change when the resolver switches to reading the column. Rows keep NULL only when the agent is
 * disabled (the resolver treats NULL as "nothing included", identical to today's 'none' tier).
 */
export class SubscriptionPlanTiers3169900000002 implements Migration {
    name = 'SubscriptionPlanTiers3169900000002'
    breaking = false
    release = '0.98.0'
    transaction = true

    public async up(queryRunner: QueryRunner): Promise<void> {
        // The two agent flags predate this migration (browser-agent Phase 1) — guarded so this
        // migration also succeeds on a database that never ran that one.
        await queryRunner.query('ALTER TABLE "platform_plan" ADD COLUMN IF NOT EXISTS "browserAgentEnabled" boolean NOT NULL DEFAULT false')
        await queryRunner.query('ALTER TABLE "platform_plan" ADD COLUMN IF NOT EXISTS "agentSharingUnlocked" boolean NOT NULL DEFAULT false')
        // The promoted entitlement set.
        await queryRunner.query('ALTER TABLE "platform_plan" ADD COLUMN IF NOT EXISTS "agentCaps" jsonb')

        // Backfill: materialise today's name-derived tier into agentCaps for every platform that has
        // the browser agent enabled. Only touches rows where agentCaps IS NULL, so re-running is a
        // no-op and a platform already moved to a new tier is never overwritten.
        await queryRunner.query(`
            UPDATE "platform_plan" SET "agentCaps" = $1::jsonb
            WHERE "agentCaps" IS NULL AND "browserAgentEnabled" = true
              AND LOWER(COALESCE("plan", '')) LIKE '%enterprise%'
        `, [JSON.stringify(CAPS_ENTERPRISE)])

        await queryRunner.query(`
            UPDATE "platform_plan" SET "agentCaps" = $1::jsonb
            WHERE "agentCaps" IS NULL AND "browserAgentEnabled" = true
              AND LOWER(COALESCE("plan", '')) LIKE '%team%'
        `, [JSON.stringify(CAPS_TEAM)])

        await queryRunner.query(`
            UPDATE "platform_plan" SET "agentCaps" = $1::jsonb
            WHERE "agentCaps" IS NULL AND "browserAgentEnabled" = true
              AND (LOWER(COALESCE("plan", '')) LIKE '%pro%' OR LOWER(COALESCE("plan", '')) LIKE '%complete%')
        `, [JSON.stringify(CAPS_PRO)])

        await queryRunner.query(`
            UPDATE "platform_plan" SET "agentCaps" = $1::jsonb
            WHERE "agentCaps" IS NULL AND "browserAgentEnabled" = true
              AND (LOWER(COALESCE("plan", '')) LIKE '%starter%'
                   OR LOWER(COALESCE("plan", '')) LIKE '%standard%'
                   OR LOWER(COALESCE("plan", '')) LIKE '%midi%')
        `, [JSON.stringify(CAPS_STARTER)])

        // Anything else that is agent-enabled fell through to 'free' under the old heuristic.
        await queryRunner.query(`
            UPDATE "platform_plan" SET "agentCaps" = $1::jsonb
            WHERE "agentCaps" IS NULL AND "browserAgentEnabled" = true
        `, [JSON.stringify(CAPS_FREE)])

        // Index the plan name: the billing/admin surfaces filter platforms by tier.
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_platform_plan_plan" ON "platform_plan" ("plan")')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS "idx_platform_plan_plan"')
        await queryRunner.query('ALTER TABLE "platform_plan" DROP COLUMN IF EXISTS "agentCaps"')
        // browserAgentEnabled / agentSharingUnlocked are owned by the browser-agent Phase-1
        // migration — deliberately NOT dropped here (dropping them would break that migration's
        // contract and destroy the product-scope state).
    }
}

// The cap sets, inlined as literals. A migration must be a FROZEN historical fact: it cannot import
// the shared plan constants, because those will legitimately be re-tuned (§9.4) and a migration that
// changed meaning after the fact would corrupt the backfill it already performed. These mirror the
// shared AGENT_CAPS_* values at the time this migration was written.
const UNLIMITED = -1

const CAPS_FREE = {
    monthly: { ACTIONS: 25, RESEARCH: 3, FILE_OPS: 3, ROUTINE_RUNS: 50, QUICK_TOOLS: 20, MEMORY_OPS: 100 },
    maxBatchRows: 0, maxConcurrentRows: 0, maxSchedules: 0, reasoningAllowed: false, recallTier: 'free',
}

const CAPS_STARTER = {
    monthly: { ACTIONS: 400, RESEARCH: 40, FILE_OPS: 50, ROUTINE_RUNS: 2000, QUICK_TOOLS: 300, MEMORY_OPS: 2000 },
    maxBatchRows: 200, maxConcurrentRows: 2, maxSchedules: 5, reasoningAllowed: false, recallTier: 'free',
}

const CAPS_PRO = {
    monthly: { ACTIONS: 3000, RESEARCH: 300, FILE_OPS: 500, ROUTINE_RUNS: 20000, QUICK_TOOLS: 3000, MEMORY_OPS: 10000 },
    maxBatchRows: 1000, maxConcurrentRows: 3, maxSchedules: 20, reasoningAllowed: true, recallTier: 'pro',
}

const CAPS_TEAM = {
    monthly: { ACTIONS: 3000, RESEARCH: 300, FILE_OPS: 500, ROUTINE_RUNS: 20000, QUICK_TOOLS: 3000, MEMORY_OPS: 10000 },
    maxBatchRows: 1000, maxConcurrentRows: 5, maxSchedules: 40, reasoningAllowed: true, recallTier: 'pro',
}

const CAPS_ENTERPRISE = {
    monthly: {
        ACTIONS: UNLIMITED, RESEARCH: UNLIMITED, FILE_OPS: UNLIMITED,
        ROUTINE_RUNS: UNLIMITED, QUICK_TOOLS: UNLIMITED, MEMORY_OPS: UNLIMITED,
    },
    maxBatchRows: 5000, maxConcurrentRows: 10, maxSchedules: 200, reasoningAllowed: true, recallTier: 'enterprise',
}
