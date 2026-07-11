import { MigrationInterface, QueryRunner } from 'typeorm'

// Enterprise migration (capability spec E.3). The organization-provided OAuth client secret is
// sensitive and MUST be encrypted at rest (Part III): it is stored as an EncryptedObject
// ({ iv, data }) rather than a plaintext string. The baseline created `oauth_app.clientSecret`
// as `character varying`; this migration changes it to `jsonb` so the encrypted object persists
// faithfully and matches the entity.
//
// A fresh deployment has no rows. Any pre-existing value would be an un-encrypted plaintext
// secret with no recoverable ciphertext, so it is intentionally discarded (set to an empty
// Encrypted-object shape) rather than silently reinterpreted — a secret that was never encrypted
// must be re-registered, not smuggled through as if it were.
//
// Lives in the enterprise database-manager and runs in the SINGLE unified, forward-only sequence
// every edition applies (I.9): its monotonic timestamp orders it after the baseline, it applies
// in its own transaction, and the runner records/skips it if already applied.
export class OAuthAppClientSecretToJsonb1782000000000 implements MigrationInterface {
    name = 'OAuthAppClientSecretToJsonb1782000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop any legacy plaintext secrets (unrecoverable as ciphertext) before the type change.
        await queryRunner.query(`
            UPDATE "oauth_app" SET "clientSecret" = '{"iv":"","data":""}'
        `)
        await queryRunner.query(`
            ALTER TABLE "oauth_app"
            ALTER COLUMN "clientSecret" TYPE jsonb USING "clientSecret"::jsonb
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "oauth_app"
            ALTER COLUMN "clientSecret" TYPE character varying USING "clientSecret"::text
        `)
    }

}
