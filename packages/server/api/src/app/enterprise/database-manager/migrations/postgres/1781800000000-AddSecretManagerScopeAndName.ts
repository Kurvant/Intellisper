import { MigrationInterface, QueryRunner } from 'typeorm'

// Enterprise migration (capability spec I.9 / E.6). Adds the scope/name/projectIds columns to
// secret_manager: a store carries a display name, a scope (organization-wide PLATFORM or
// workspace-scoped PROJECT), and — when workspace-scoped — the list of workspaces that may use
// it. Existing rows (none in a fresh deployment) default to a PLATFORM-scoped, unnamed store;
// the columns are backfilled to satisfy the NOT NULL constraint.
//
// This migration lives in the enterprise database-manager but runs in the SINGLE unified,
// forward-only sequence every edition applies (I.9): its monotonic timestamp key orders it
// after the baseline, it applies in its own transaction, and it is idempotent (already-applied
// migrations are recorded and skipped by the runner).
export class AddSecretManagerScopeAndName1781800000000 implements MigrationInterface {
    name = 'AddSecretManagerScopeAndName1781800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "secret_manager"
            ADD COLUMN "name" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "secret_manager"
            ADD COLUMN "scope" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "secret_manager"
            ADD COLUMN "projectIds" jsonb
        `)
        await queryRunner.query(`
            UPDATE "secret_manager" SET "name" = COALESCE("name", "providerId"), "scope" = COALESCE("scope", 'PLATFORM')
        `)
        await queryRunner.query(`
            ALTER TABLE "secret_manager" ALTER COLUMN "name" SET NOT NULL
        `)
        await queryRunner.query(`
            ALTER TABLE "secret_manager" ALTER COLUMN "scope" SET NOT NULL
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "secret_manager" DROP COLUMN "projectIds"
        `)
        await queryRunner.query(`
            ALTER TABLE "secret_manager" DROP COLUMN "scope"
        `)
        await queryRunner.query(`
            ALTER TABLE "secret_manager" DROP COLUMN "name"
        `)
    }

}
