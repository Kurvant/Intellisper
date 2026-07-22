import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

/**
 * Memory feature: per-fact admin visibility + the Studio (org/flow) memory scopes.
 *
 * WHY these columns exist (the privacy contract they implement):
 *   `browser_agent_memory_fact.visibility` is the INNERMOST of three independent conditions that
 *   must ALL hold before a platform admin can see a user's fact:
 *     1. platform_plan.agentSharingUnlocked  — the admin enabled the capability platform-wide
 *     2. user.agentSharingOptIn              — the owner opted in to admin visibility
 *     3. memory_fact.visibility = 'SHARED'   — the owner marked THIS fact shareable
 *   It defaults to 'PRIVATE', so every fact that exists today — and every fact captured in future
 *   without an explicit share — is permanently invisible to an admin. A user's opt-in alone grants
 *   nothing; it only lets facts they individually marked SHARED become visible. Revoking either of
 *   the outer switches hides everything instantly without disturbing the per-fact marks.
 *
 *   `flowId` carries the FLOW scope (Studio per-flow memory — facts a flow accumulates across its
 *   runs). NULL for USER/PLATFORM facts.
 *
 * The user preference columns sit next to the existing `agentSharingOptIn` on `user`: browser-agent
 * -owned, deliberately kept OFF the shared `User` model (same pattern as the Phase-1 flags), so
 * blockunits' user contract is untouched.
 *
 * Additive + idempotent; safe to re-run. The Phase-1 create migration is frozen, so this adds.
 */
export class MemoryVisibilityAndScopes3169900000004 implements Migration {
    name = 'MemoryVisibilityAndScopes3169900000004'
    breaking = false
    release = '0.102.0'
    transaction = true

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Per-fact admin-visibility mark. DEFAULT 'PRIVATE' is the safe default: pre-existing facts
        // (captured before this feature) can never become admin-visible without a deliberate act.
        await queryRunner.query(
            'ALTER TABLE "browser_agent_memory_fact" ADD COLUMN IF NOT EXISTS "visibility" character varying NOT NULL DEFAULT \'PRIVATE\'',
        )
        // FLOW-scoped facts point at their flow; NULL for USER/PLATFORM.
        await queryRunner.query(
            'ALTER TABLE "browser_agent_memory_fact" ADD COLUMN IF NOT EXISTS "flowId" character varying(21)',
        )

        // The admin read filters (platformId, scope, visibility); the Studio reads filter by flow.
        await queryRunner.query(
            'CREATE INDEX IF NOT EXISTS "idx_ba_memory_fact_platform_scope" ON "browser_agent_memory_fact" ("platformId", "scope")',
        )
        await queryRunner.query(
            'CREATE INDEX IF NOT EXISTS "idx_ba_memory_fact_flow" ON "browser_agent_memory_fact" ("flowId") WHERE "flowId" IS NOT NULL',
        )
        // Partial index for the admin's shared-fact read — the only path that reads USER facts
        // across owners, and only ever the SHARED ones.
        await queryRunner.query(
            'CREATE INDEX IF NOT EXISTS "idx_ba_memory_fact_shared" ON "browser_agent_memory_fact" ("platformId", "visibility") WHERE "visibility" = \'SHARED\'',
        )

        // Per-user memory preferences. Both default TRUE: memory that neither recalls nor captures is
        // useless, and these govern the user's OWN experience — not who can see their data. The
        // visibility switches above are the ones that default closed.
        await queryRunner.query(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "agentMemoryAutoRecall" boolean NOT NULL DEFAULT true',
        )
        await queryRunner.query(
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "agentMemoryAutoCapture" boolean NOT NULL DEFAULT true',
        )

        // ── Backfill: memory becomes a PAID capability ──────────────────────────────────────────
        // `agentCaps` gained two required fields (`memoryEnabled`, `maxFacts`). The plan resolver
        // validates the blob strictly and fails CLOSED, so a row written before this migration would
        // resolve to AGENT_CAPS_NONE — disabling the whole agent, not just memory. Backfill every
        // existing blob so no live platform regresses.
        //
        // The grant follows the tier the row already proves it bought, keyed off `reasoningAllowed`
        // (the existing paid-tier marker) — never a blanket enable:
        //   - reasoningAllowed = true  → Pro/Team/Enterprise → memory ON  (they pay for it today)
        //   - MEMORY_OPS cap > 0       → Starter             → memory ON
        //   - otherwise                → Free/none           → memory OFF (the new paid door)
        await queryRunner.query(`
            UPDATE "platform_plan"
            SET "agentCaps" = "agentCaps"
                || jsonb_build_object(
                    'memoryEnabled',
                    CASE
                        WHEN ("agentCaps" -> 'reasoningAllowed')::text = 'true' THEN true
                        WHEN COALESCE(("agentCaps" -> 'monthly' ->> 'MEMORY_OPS')::int, 0) <> 0 THEN true
                        ELSE false
                    END,
                    'maxFacts',
                    CASE
                        WHEN COALESCE(("agentCaps" -> 'monthly' ->> 'MEMORY_OPS')::int, 0) = -1 THEN -1
                        WHEN ("agentCaps" -> 'reasoningAllowed')::text = 'true' THEN 10000
                        WHEN COALESCE(("agentCaps" -> 'monthly' ->> 'MEMORY_OPS')::int, 0) <> 0 THEN 1000
                        ELSE 0
                    END
                )
            WHERE "agentCaps" IS NOT NULL
              AND jsonb_typeof("agentCaps") = 'object'
              AND NOT ("agentCaps" ? 'memoryEnabled')
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "user" DROP COLUMN IF EXISTS "agentMemoryAutoCapture"')
        await queryRunner.query('ALTER TABLE "user" DROP COLUMN IF EXISTS "agentMemoryAutoRecall"')
        await queryRunner.query('DROP INDEX IF EXISTS "idx_ba_memory_fact_shared"')
        await queryRunner.query('DROP INDEX IF EXISTS "idx_ba_memory_fact_flow"')
        await queryRunner.query('DROP INDEX IF EXISTS "idx_ba_memory_fact_platform_scope"')
        await queryRunner.query('ALTER TABLE "browser_agent_memory_fact" DROP COLUMN IF EXISTS "flowId"')
        await queryRunner.query('ALTER TABLE "browser_agent_memory_fact" DROP COLUMN IF EXISTS "visibility"')
    }
}
