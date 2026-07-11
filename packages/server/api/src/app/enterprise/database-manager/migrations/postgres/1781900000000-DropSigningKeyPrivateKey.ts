import { MigrationInterface, QueryRunner } from 'typeorm'

// Enterprise migration (capability spec I.9 / D.1). Removes the persisted `privateKey` column
// from signing_key: the platform MUST NOT hold a copy of the private key — it is returned to the
// caller exactly once at creation and never stored. The row keeps only the public key, display
// name, algorithm, and owning-organization reference.
//
// Runs in the single unified, forward-only sequence every edition applies (I.9): its monotonic
// timestamp key orders it after the baseline, it applies in its own transaction, and the runner
// records/skips already-applied migrations (idempotent).
export class DropSigningKeyPrivateKey1781900000000 implements MigrationInterface {
    name = 'DropSigningKeyPrivateKey1781900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "signing_key" DROP COLUMN IF EXISTS "privateKey"
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Re-add as nullable on rollback (the value cannot be recovered — it was never stored).
        await queryRunner.query(`
            ALTER TABLE "signing_key" ADD COLUMN IF NOT EXISTS "privateKey" character varying
        `)
    }

}
