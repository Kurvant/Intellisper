import { IbEdition } from '@intelblocks/shared'
import { MigrationInterface, QueryRunner } from 'typeorm'
import { isNotOneOfTheseEditions } from '../../database-common'

export class AddDisplayNameToSigningKey1698698190965
implements MigrationInterface {
    name = 'AddDisplayNameToSigningKey1698698190965'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (isNotOneOfTheseEditions([IbEdition.CLOUD, IbEdition.ENTERPRISE])) {
            return
        }
        await queryRunner.query(`
            ALTER TABLE "signing_key"
            ADD "displayName" character varying NOT NULL
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (isNotOneOfTheseEditions([IbEdition.CLOUD, IbEdition.ENTERPRISE])) {
            return
        }
        await queryRunner.query(`
            ALTER TABLE "signing_key" DROP COLUMN "displayName"
        `)
    }
}
