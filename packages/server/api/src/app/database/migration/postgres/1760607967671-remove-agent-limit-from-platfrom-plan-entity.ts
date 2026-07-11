import { IbEdition } from '@intelblocks/shared'
import { MigrationInterface, QueryRunner } from 'typeorm'
import { isNotOneOfTheseEditions } from '../../database-common'

export class RemoveAgentLimitFromPlatfromPlanEntity1760607967671 implements MigrationInterface {
    name = 'RemoveAgentLimitFromPlatfromPlanEntity1760607967671'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (isNotOneOfTheseEditions([IbEdition.CLOUD, IbEdition.ENTERPRISE])) {
            return
        }
        await queryRunner.query(`
            ALTER TABLE "platform_plan" DROP COLUMN "agentsLimit"
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (isNotOneOfTheseEditions([IbEdition.CLOUD, IbEdition.ENTERPRISE])) {
            return
        }
        await queryRunner.query(`
            ALTER TABLE "platform_plan"
            ADD "agentsLimit" integer
        `)
    }

}
