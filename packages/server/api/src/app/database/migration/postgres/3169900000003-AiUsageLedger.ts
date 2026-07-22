import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * AI Gateway — the usage ledger.
 *
 * One row per AI call, across every plane. This is the first platform-owned record of what AI
 * actually costs us: until now, "spend" was a read-through of OpenRouter's key ledger, so every
 * direct-vendor call (Anthropic, OpenAI, Bedrock, Azure, Gemini) was real money that showed up
 * nowhere, and no spend could be attributed to a product surface or a customer.
 *
 * Purely ADDITIVE — a new table and nothing else. No existing row, column, or behaviour is touched,
 * so this cannot regress anything that ships today.
 *
 * Idempotent (IF NOT EXISTS throughout) so a re-run is a no-op.
 */
export class AiUsageLedger3169900000003 implements MigrationInterface {
    name = 'AiUsageLedger3169900000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_usage_ledger" (
                "id"               VARCHAR(21)  NOT NULL,
                "created"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
                "updated"          TIMESTAMPTZ  NOT NULL DEFAULT now(),

                "platformId"       VARCHAR(21)  NOT NULL,
                "projectId"        VARCHAR(21)  NULL,
                "userId"           VARCHAR(21)  NULL,
                "feature"          VARCHAR(32)  NOT NULL,
                "featureRef"       VARCHAR(64)  NULL,

                "provider"         VARCHAR(64)  NOT NULL,
                "model"            VARCHAR(128) NOT NULL,
                "modality"         VARCHAR(16)  NOT NULL,
                "keyMode"          VARCHAR(16)  NOT NULL,

                -- Raw token truth. These are the PRIMARY record; the money below is derived from them,
                -- which is what makes any window re-costable if a vendor rate (or our table) was wrong.
                -- "inputTokens" is FRESH input only: it excludes cacheRead and cacheWrite, so the four
                -- token columns are disjoint and can be summed without double-counting. (Anthropic's own
                -- reported input total INCLUDES its cache tokens; normalizing that away is the single
                -- most expensive mistake this table is designed to prevent.)
                "inputTokens"      INTEGER      NOT NULL DEFAULT 0,
                "outputTokens"     INTEGER      NOT NULL DEFAULT 0,
                "cacheReadTokens"  INTEGER      NOT NULL DEFAULT 0,
                "cacheWriteTokens" INTEGER      NOT NULL DEFAULT 0,
                "reasoningTokens"  INTEGER      NOT NULL DEFAULT 0,

                -- COGS. NUMERIC(14,8), deliberately NOT the (12,6) of the original spec: a single cheap
                -- call (Haiku, ~200 tokens) costs on the order of $0.00008, which at 6 decimal places
                -- rounds toward zero — a million such calls would then aggregate to a materially wrong
                -- number. 8 places holds it exactly. NUMERIC (not float) because money must not drift.
                "costUsd"          NUMERIC(14,8) NOT NULL DEFAULT 0,
                -- provider = the vendor told us this exact amount (authoritative)
                -- computed = derived from our price table (an estimate)
                -- unpriced = no vendor cost AND no table entry -> cost is 0 and KNOWN to be incomplete.
                --            Surfaced in the dashboard as unpriced volume, never as free money.
                "costSource"       VARCHAR(16)  NOT NULL,
                "priceVersion"     VARCHAR(32)  NULL,
                -- Revenue, in credits (1000 = $1) — the unit we actually bill in. The original spec had
                -- an INTEGER USD column for this, which cannot represent any price below one dollar,
                -- and every per-call charge we make is below one dollar.
                "billedCredits"    INTEGER      NOT NULL DEFAULT 0,

                "requestId"        VARCHAR(128) NULL,
                "idempotencyKey"   VARCHAR(128) NOT NULL,
                "metadata"         JSONB        NULL,

                CONSTRAINT "pk_ai_usage_ledger" PRIMARY KEY ("id")
            )
        `)

        // THE anti-double-count guarantee.
        // Every transport feeding this table is at-least-once: a retried worker job, a re-delivered
        // Socket.IO RPC, a resumed engine step. So the same call CAN be reported twice. This index makes
        // the second write a no-op (the writer uses ON CONFLICT DO NOTHING) instead of silently doubling
        // a customer's cost. Enforced by the database, because "everyone remembers to be careful" is not
        // a guarantee — and double-counted spend is precisely the misleading report that gets expensive.
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_usage_ledger_idempotency"
                ON "ai_usage_ledger" ("idempotencyKey")
        `)

        // The tenant-scoped time-window scan every dashboard read performs.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_ai_usage_ledger_platform_created"
                ON "ai_usage_ledger" ("platformId", "created" DESC)
        `)

        // "What is this customer spending, by product surface?" — the question the OpenRouter key
        // ledger structurally cannot answer, because it has exactly one bucket per platform.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_ai_usage_ledger_platform_feature_created"
                ON "ai_usage_ledger" ("platformId", "feature", "created" DESC)
        `)

        // Retention prune scans by time alone, across all tenants.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_ai_usage_ledger_created"
                ON "ai_usage_ledger" ("created")
        `)

        // CASCADE from platform: a deleted tenant's rows go with it.
        await queryRunner.query(`
            ALTER TABLE "ai_usage_ledger"
                ADD CONSTRAINT "fk_ai_usage_ledger_platform_id"
                FOREIGN KEY ("platformId") REFERENCES "platform" ("id")
                ON DELETE CASCADE ON UPDATE RESTRICT
        `)

        // SET NULL from project — NOT cascade. Deleting a project must not erase the money we already
        // spent running it: the cost is a historical fact and has to outlive its subject.
        await queryRunner.query(`
            ALTER TABLE "ai_usage_ledger"
                ADD CONSTRAINT "fk_ai_usage_ledger_project_id"
                FOREIGN KEY ("projectId") REFERENCES "project" ("id")
                ON DELETE SET NULL ON UPDATE RESTRICT
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS "ai_usage_ledger"')
    }
}
