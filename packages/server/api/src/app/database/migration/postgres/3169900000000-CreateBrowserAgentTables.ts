import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

/**
 * Phase 1 of the Intellisper browser-agent port: creates all browser-agent tables (conversation,
 * message, run, action, memory fact/entity/relation, routine + step + run, batch job, schedule,
 * file, audit log, usage counter), plus the per-user sharing opt-in flag on `user` and the
 * platform sharing-unlock + browser-agent-enabled flags on `platform_plan`.
 *
 * pgvector: the memory embedding column + HNSW index are created only when the `vector` extension
 * is available. Everything is wrapped so a vanilla-Postgres install still migrates and boots
 * (the memory feature degrades gracefully — see AGENTS.md and the merge plan). Every statement is
 * idempotent (IF NOT EXISTS / guarded DO-blocks) so re-running is safe.
 *
 * All tables are scoped by platformId + userId; row-level visibility is enforced in the
 * application layer by the mandatory `agentScope` helper (RLS-via-GUC was evaluated and rejected
 * for this shared-pool / non-transactional-read codebase — see plan §4.3).
 */
export class CreateBrowserAgentTables3169900000000 implements Migration {
    name = 'CreateBrowserAgentTables3169900000000'
    breaking = false
    release = '0.95.0'
    transaction = true

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── pgvector extension (best-effort; memory degrades gracefully if unavailable) ──────────
        await queryRunner.query(`
            DO $$
            BEGIN
                CREATE EXTENSION IF NOT EXISTS vector;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'pgvector extension unavailable — browser-agent memory features will be disabled';
            END $$;
        `)

        // ── conversation / message / run / action ────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_conversation" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "title" character varying,
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_browser_agent_conversation" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_conversation_platform_user" ON "browser_agent_conversation" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_conversation_project" ON "browser_agent_conversation" ("projectId")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_message" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "conversationId" character varying(21) NOT NULL,
                "role" character varying NOT NULL,
                "content" text NOT NULL,
                "toolCalls" jsonb,
                CONSTRAINT "pk_browser_agent_message" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_message_conversation" ON "browser_agent_message" ("conversationId")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_run" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "conversationId" character varying(21) NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "status" character varying NOT NULL,
                "stepCount" integer NOT NULL DEFAULT 0,
                "tokenCost" bigint NOT NULL DEFAULT 0,
                "haltReason" character varying,
                "checkpoint" jsonb,
                "startedAt" TIMESTAMP WITH TIME ZONE,
                "endedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_browser_agent_run" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_run_platform_user" ON "browser_agent_run" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_run_conversation" ON "browser_agent_run" ("conversationId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_run_status" ON "browser_agent_run" ("status")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_action" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "runId" character varying(21) NOT NULL,
                "type" character varying NOT NULL,
                "targetRef" character varying,
                "args" jsonb,
                "class" character varying NOT NULL,
                "status" character varying NOT NULL,
                "approvedBy" character varying(21),
                "result" jsonb,
                CONSTRAINT "pk_browser_agent_action" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_action_run" ON "browser_agent_action" ("runId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_action_status" ON "browser_agent_action" ("status")')

        // ── memory (always private) ──────────────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_memory_fact" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "scope" character varying NOT NULL,
                "kind" character varying NOT NULL,
                "content" text NOT NULL,
                "source" character varying NOT NULL,
                "embeddingModel" character varying,
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_browser_agent_memory_fact" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_memory_fact_platform_user" ON "browser_agent_memory_fact" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_memory_fact_user_kind" ON "browser_agent_memory_fact" ("userId", "kind")')
        // Embedding column + HNSW index only when pgvector is present (graceful degradation).
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
                    -- Schema-qualify the type + operator class: the extension installs into
                    -- whatever schema pg_extension records (typically public), so an unqualified
                    -- "vector" only resolves when that schema is on search_path. Qualifying makes
                    -- this robust regardless of the session search_path.
                    ALTER TABLE "browser_agent_memory_fact" ADD COLUMN IF NOT EXISTS "embedding" public.vector(1536);
                    CREATE INDEX IF NOT EXISTS "idx_ba_memory_fact_embedding"
                        ON "browser_agent_memory_fact" USING hnsw ("embedding" public.vector_cosine_ops)
                        WHERE "embedding" IS NOT NULL;
                END IF;
            END $$;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_memory_entity" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "type" character varying NOT NULL,
                "name" character varying NOT NULL,
                "attributes" jsonb,
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_browser_agent_memory_entity" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_memory_entity_platform_user" ON "browser_agent_memory_entity" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_memory_entity_user_type_name" ON "browser_agent_memory_entity" ("userId", "type", "name")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_memory_relation" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "fromEntityId" character varying(21) NOT NULL,
                "toEntityId" character varying(21) NOT NULL,
                "relation" character varying NOT NULL,
                CONSTRAINT "pk_browser_agent_memory_relation" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_memory_relation_platform_user" ON "browser_agent_memory_relation" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_memory_relation_from" ON "browser_agent_memory_relation" ("fromEntityId")')

        // ── routine / step / run ─────────────────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_routine" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "description" character varying,
                "params" jsonb NOT NULL DEFAULT '[]',
                "version" integer NOT NULL DEFAULT 1,
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_browser_agent_routine" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_routine_platform_user" ON "browser_agent_routine" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_routine_project" ON "browser_agent_routine" ("projectId")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_routine_step" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "routineId" character varying(21) NOT NULL,
                "ordinal" integer NOT NULL,
                "action" character varying NOT NULL,
                "locators" jsonb NOT NULL,
                "intent" text NOT NULL,
                "config" jsonb,
                CONSTRAINT "pk_browser_agent_routine_step" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_routine_step_routine" ON "browser_agent_routine_step" ("routineId")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_routine_run" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "routineId" character varying(21) NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "batchJobId" character varying(21),
                "rowIndex" integer,
                "paramValues" jsonb,
                "agentRunId" character varying(21),
                "status" character varying NOT NULL,
                "progress" jsonb,
                "startedAt" TIMESTAMP WITH TIME ZONE,
                "endedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_browser_agent_routine_run" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_routine_run_platform_user" ON "browser_agent_routine_run" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_routine_run_routine" ON "browser_agent_routine_run" ("routineId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_routine_run_batch" ON "browser_agent_routine_run" ("batchJobId")')

        // ── batch job / schedule ─────────────────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_batch_job" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "routineId" character varying(21) NOT NULL,
                "status" character varying NOT NULL,
                "rowsTotal" integer NOT NULL DEFAULT 0,
                "rowsCompleted" integer NOT NULL DEFAULT 0,
                "rowsFailed" integer NOT NULL DEFAULT 0,
                "concurrency" integer NOT NULL DEFAULT 1,
                "notify" jsonb,
                CONSTRAINT "pk_browser_agent_batch_job" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_batch_platform_user" ON "browser_agent_batch_job" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_batch_status" ON "browser_agent_batch_job" ("status")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_schedule" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "routineId" character varying(21) NOT NULL,
                "cron" character varying NOT NULL,
                "timezone" character varying NOT NULL,
                "paramSets" jsonb,
                "notify" jsonb,
                "enabled" boolean NOT NULL DEFAULT true,
                "lastRunAt" TIMESTAMP WITH TIME ZONE,
                "nextRunAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_browser_agent_schedule" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_schedule_platform_user" ON "browser_agent_schedule" ("platformId", "userId")')

        // ── file / audit / usage ─────────────────────────────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_file" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "conversationId" character varying(21),
                "name" character varying NOT NULL,
                "mime" character varying NOT NULL,
                "sizeBytes" integer NOT NULL,
                "contentHash" character varying NOT NULL,
                "s3Key" character varying NOT NULL,
                "version" integer NOT NULL DEFAULT 1,
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_browser_agent_file" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_file_platform_user" ON "browser_agent_file" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_file_user_hash" ON "browser_agent_file" ("userId", "contentHash")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_audit_log" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "runId" character varying(21),
                "event" character varying NOT NULL,
                "detail" jsonb,
                CONSTRAINT "pk_browser_agent_audit_log" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_audit_platform_user" ON "browser_agent_audit_log" ("platformId", "userId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_audit_run" ON "browser_agent_audit_log" ("runId")')

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "browser_agent_usage_counter" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "period" character varying NOT NULL,
                "metric" character varying NOT NULL,
                "count" integer NOT NULL DEFAULT 0,
                CONSTRAINT "pk_browser_agent_usage_counter" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "uq_ba_usage_platform_period_metric" ON "browser_agent_usage_counter" ("platformId", "period", "metric")')

        // ── foreign keys (guarded — added only if absent) ────────────────────────────────────────
        await this.addForeignKeyIfAbsent(queryRunner, 'fk_ba_message_conversation', 'browser_agent_message', 'conversationId', 'browser_agent_conversation')
        await this.addForeignKeyIfAbsent(queryRunner, 'fk_ba_run_conversation', 'browser_agent_run', 'conversationId', 'browser_agent_conversation')
        await this.addForeignKeyIfAbsent(queryRunner, 'fk_ba_action_run', 'browser_agent_action', 'runId', 'browser_agent_run')
        await this.addForeignKeyIfAbsent(queryRunner, 'fk_ba_memory_relation_from', 'browser_agent_memory_relation', 'fromEntityId', 'browser_agent_memory_entity')
        await this.addForeignKeyIfAbsent(queryRunner, 'fk_ba_memory_relation_to', 'browser_agent_memory_relation', 'toEntityId', 'browser_agent_memory_entity')
        await this.addForeignKeyIfAbsent(queryRunner, 'fk_ba_routine_step_routine', 'browser_agent_routine_step', 'routineId', 'browser_agent_routine')
        await this.addForeignKeyIfAbsent(queryRunner, 'fk_ba_routine_run_routine', 'browser_agent_routine_run', 'routineId', 'browser_agent_routine')

        // ── per-user sharing opt-in + platform-level flags ───────────────────────────────────────
        await queryRunner.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "agentSharingOptIn" boolean NOT NULL DEFAULT false')
        // platform_plan flags: sharing must be unlocked by an admin before opt-in has any effect,
        // and the whole browser-agent surface is gated by browserAgentEnabled (off by default).
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_plan') THEN
                    ALTER TABLE "platform_plan" ADD COLUMN IF NOT EXISTS "browserAgentEnabled" boolean NOT NULL DEFAULT false;
                    ALTER TABLE "platform_plan" ADD COLUMN IF NOT EXISTS "agentSharingUnlocked" boolean NOT NULL DEFAULT false;
                END IF;
            END $$;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_plan') THEN
                    ALTER TABLE "platform_plan" DROP COLUMN IF EXISTS "agentSharingUnlocked";
                    ALTER TABLE "platform_plan" DROP COLUMN IF EXISTS "browserAgentEnabled";
                END IF;
            END $$;
        `)
        await queryRunner.query('ALTER TABLE "user" DROP COLUMN IF EXISTS "agentSharingOptIn"')
        for (const table of [
            'browser_agent_usage_counter',
            'browser_agent_audit_log',
            'browser_agent_file',
            'browser_agent_schedule',
            'browser_agent_batch_job',
            'browser_agent_routine_run',
            'browser_agent_routine_step',
            'browser_agent_routine',
            'browser_agent_memory_relation',
            'browser_agent_memory_entity',
            'browser_agent_memory_fact',
            'browser_agent_action',
            'browser_agent_run',
            'browser_agent_message',
            'browser_agent_conversation',
        ]) {
            await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`)
        }
    }

    private async addForeignKeyIfAbsent(
        queryRunner: QueryRunner,
        constraintName: string,
        table: string,
        column: string,
        referencedTable: string,
    ): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') THEN
                    ALTER TABLE "${table}"
                        ADD CONSTRAINT "${constraintName}"
                        FOREIGN KEY ("${column}") REFERENCES "${referencedTable}"("id") ON DELETE CASCADE;
                END IF;
            END $$;
        `)
    }
}
