import { IbEdition } from '@intelblocks/shared'
import { MigrationInterface, QueryRunner } from 'typeorm'
import { isNotOneOfTheseEditions } from '../../database-common'

export class RemoveUserSeatsLimitColumn1761762177701 implements MigrationInterface {
    name = 'RemoveUserSeatsLimitColumn1761762177701'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (isNotOneOfTheseEditions([IbEdition.CLOUD, IbEdition.ENTERPRISE])) {
            return
        }
        await queryRunner.query(`
            ALTER TABLE "platform_plan" DROP COLUMN "userSeatsLimit"
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (isNotOneOfTheseEditions([IbEdition.CLOUD, IbEdition.ENTERPRISE])) {
            return
        }
        await queryRunner.query(`
            ALTER TABLE "platform_plan"
            ADD "userSeatsLimit" integer
        `)
    }

}
