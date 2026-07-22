import { AIProviderName, ibId } from '@intelblocks/shared'
import { MigrationInterface, QueryRunner } from 'typeorm'
import { encryptUtils } from '../../../helper/encryption'

export class RemoveOpenRounterKeysFromPlatformPlan1766094015801 implements MigrationInterface {
    name = 'RemoveOpenRounterKeysFromPlatformPlan1766094015801'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const plans = await queryRunner.query(`
            SELECT id, "platformId", "openRouterApiKey", "openRouterApiKeyHash"
            FROM "platform_plan"
            WHERE "openRouterApiKey" IS NOT NULL
        `)

        for (const plan of plans) {
            const config: Record<string, string> = {
                apiKey: plan.openRouterApiKey as string,
                apiKeyHash: plan.openRouterApiKeyHash as string,
            }

            const encryptedConfig = await encryptUtils.encryptObject(config)

            await queryRunner.query(`
                INSERT INTO "ai_provider" ("id", "platformId", "provider", "displayName", "config", "created", "updated")
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            `, [
                ibId(),
                plan.platformId,
                // The managed-provider row this migration CREATES must carry the name the live
                // resolver looks rows up by (`aiProviderService` matches on INTELLISPER). Writing
                // the pre-rebrand name here produced a row nothing could ever find, silently losing
                // the platform's OpenRouter key.
                AIProviderName.INTELLISPER,
                'Intellisper',
                encryptedConfig,
            ])
        }

        await queryRunner.query(`
            ALTER TABLE "platform_plan" DROP COLUMN "openRouterApiKeyHash"
        `)
        await queryRunner.query(`
            ALTER TABLE "platform_plan" DROP COLUMN "openRouterApiKey"
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "platform_plan"
            ADD "openRouterApiKey" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "platform_plan"
            ADD "openRouterApiKeyHash" character varying
        `)
    }

}
