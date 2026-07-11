import { MigrationInterface, QueryRunner } from 'typeorm'

// Enterprise migration (capability spec H.2.m). Creates chat_message_metric — one row per completed
// chat message, the aggregatable source for the internal-admin chat analytics. Local store only; no
// data ever leaves the server. Runs in the single unified, forward-only migration sequence.
export class AddChatMessageMetric1782100000000 implements MigrationInterface {
    name = 'AddChatMessageMetric1782100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chat_message_metric" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "projectId" character varying(21),
                "userId" character varying(21) NOT NULL,
                "conversationId" character varying(21) NOT NULL,
                "provider" character varying,
                "model" character varying,
                "toolsUsed" integer NOT NULL,
                "messageChars" integer,
                "licenseKey" character varying,
                CONSTRAINT "pk_chat_message_metric" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_chat_message_metric_platform_created" ON "chat_message_metric" ("platformId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_chat_message_metric_user_created" ON "chat_message_metric" ("userId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_chat_message_metric_conversation_id" ON "chat_message_metric" ("conversationId")
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_message_metric"
            ADD CONSTRAINT "fk_chat_message_metric_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_message_metric"
            ADD CONSTRAINT "fk_chat_message_metric_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_message_metric"
            ADD CONSTRAINT "fk_chat_message_metric_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "chat_message_metric" DROP CONSTRAINT "fk_chat_message_metric_user_id"')
        await queryRunner.query('ALTER TABLE "chat_message_metric" DROP CONSTRAINT "fk_chat_message_metric_project_id"')
        await queryRunner.query('ALTER TABLE "chat_message_metric" DROP CONSTRAINT "fk_chat_message_metric_platform_id"')
        await queryRunner.query('DROP INDEX "idx_chat_message_metric_conversation_id"')
        await queryRunner.query('DROP INDEX "idx_chat_message_metric_user_created"')
        await queryRunner.query('DROP INDEX "idx_chat_message_metric_platform_created"')
        await queryRunner.query('DROP TABLE "chat_message_metric"')
    }
}
