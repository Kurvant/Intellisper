import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

/**
 * Decouple the MEMORY entitlement from the browser-agent entitlement.
 *
 * WHY: memory is a cross-product capability — the agent uses personal memory (USER scope) and Studio
 * uses org/flow memory (PLATFORM/FLOW) — but its entitlement lived INSIDE `agentCaps`, and the caps
 * resolver returns "nothing included" whenever `browserAgentEnabled` is false. The effect was that a
 * Studio-only platform could not use memory and, worse, could not even BUY it: no Studio tier could
 * express "memory on, agent off". `memoryCaps` is its own blob so the two doors are independent.
 *
 * BACKFILL: every platform that has memory today must keep it, byte-for-byte. Existing entitlements
 * live in `agentCaps.memoryEnabled` / `.maxFacts` / `.recallTier` (+ the MEMORY_OPS monthly cap), so
 * the new blob is projected from those exact values rather than from a tier guess. A platform whose
 * agent door is shut had no memory (the resolver denied it), so it correctly backfills to disabled —
 * granting it here would hand out a paid capability nobody bought.
 *
 * Additive + idempotent; safe to re-run.
 */
export class MemoryEntitlementDecoupling3169900000005 implements Migration {
    name = 'MemoryEntitlementDecoupling3169900000005'
    breaking = false
    release = '0.103.0'
    transaction = true

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            'ALTER TABLE "platform_plan" ADD COLUMN IF NOT EXISTS "memoryCaps" jsonb',
        )

        // Project the existing agent-nested entitlement into the new standalone blob. Only rows that
        // actually had memory (agent door open AND memoryEnabled true) carry it over; everything else
        // stays NULL, which the resolver reads as closed.
        await queryRunner.query(`
            UPDATE "platform_plan"
            SET "memoryCaps" = jsonb_build_object(
                'enabled', true,
                'maxFacts', COALESCE(("agentCaps" ->> 'maxFacts')::int, 0),
                'recallTier', COALESCE("agentCaps" ->> 'recallTier', 'free'),
                'monthlyOps', COALESCE(("agentCaps" -> 'monthly' ->> 'MEMORY_OPS')::int, 0)
            )
            WHERE "memoryCaps" IS NULL
              AND "browserAgentEnabled" = true
              AND "agentCaps" IS NOT NULL
              AND jsonb_typeof("agentCaps") = 'object'
              AND ("agentCaps" -> 'memoryEnabled')::text = 'true'
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "platform_plan" DROP COLUMN IF EXISTS "memoryCaps"')
    }
}
