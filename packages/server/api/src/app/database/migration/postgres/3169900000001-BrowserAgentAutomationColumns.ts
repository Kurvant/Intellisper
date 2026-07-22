import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

/**
 * Phase 8 of the Intellisper browser-agent port (Automation): adds the columns the batch/schedule
 * subsystem needs that weren't in the Phase-1 create (which is frozen — historical migrations are
 * never edited). All additive `ADD COLUMN IF NOT EXISTS`, so re-running is safe and a fresh DB that
 * already has the Phase-1 tables just gains the new columns.
 *
 *   browser_agent_batch_job  += scheduleId, paramSets, startedAt, endedAt
 *   browser_agent_schedule   += name, repeatJobKey
 *
 * (`output` is NOT stored on the batch row — extracted output lives on each routine_run's `progress`
 * and is aggregated on export, mirroring the source design's thin-history model.)
 */
export class BrowserAgentAutomationColumns3169900000001 implements Migration {
    name = 'BrowserAgentAutomationColumns3169900000001'
    breaking = false
    release = '0.96.0'
    transaction = true

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "browser_agent_batch_job" ADD COLUMN IF NOT EXISTS "scheduleId" character varying(21)')
        await queryRunner.query('ALTER TABLE "browser_agent_batch_job" ADD COLUMN IF NOT EXISTS "paramSets" jsonb')
        await queryRunner.query('ALTER TABLE "browser_agent_batch_job" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP WITH TIME ZONE')
        await queryRunner.query('ALTER TABLE "browser_agent_batch_job" ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP WITH TIME ZONE')

        // A schedule's cron firing spawns a batch; the name is user-facing and the repeatJobKey is the
        // BullMQ job-scheduler key we deregister on disable/delete. Existing rows (none in green-field)
        // get a safe default name so the NOT NULL add can't fail.
        await queryRunner.query('ALTER TABLE "browser_agent_schedule" ADD COLUMN IF NOT EXISTS "name" character varying NOT NULL DEFAULT \'Schedule\'')
        await queryRunner.query('ALTER TABLE "browser_agent_schedule" ADD COLUMN IF NOT EXISTS "repeatJobKey" character varying')
        // Drop the temporary default so the column behaves like the entity (app always supplies name).
        await queryRunner.query('ALTER TABLE "browser_agent_schedule" ALTER COLUMN "name" DROP DEFAULT')

        // Index batch rows by schedule so a schedule's history is a fast lookup.
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_ba_batch_schedule" ON "browser_agent_batch_job" ("scheduleId")')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS "idx_ba_batch_schedule"')
        await queryRunner.query('ALTER TABLE "browser_agent_schedule" DROP COLUMN IF EXISTS "repeatJobKey"')
        await queryRunner.query('ALTER TABLE "browser_agent_schedule" DROP COLUMN IF EXISTS "name"')
        await queryRunner.query('ALTER TABLE "browser_agent_batch_job" DROP COLUMN IF EXISTS "endedAt"')
        await queryRunner.query('ALTER TABLE "browser_agent_batch_job" DROP COLUMN IF EXISTS "startedAt"')
        await queryRunner.query('ALTER TABLE "browser_agent_batch_job" DROP COLUMN IF EXISTS "paramSets"')
        await queryRunner.query('ALTER TABLE "browser_agent_batch_job" DROP COLUMN IF EXISTS "scheduleId"')
    }
}
