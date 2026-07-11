import { MigrationInterface, QueryRunner } from 'typeorm'

export class CleanRoomBaseline1781764568389 implements MigrationInterface {
    name = 'CleanRoomBaseline1781764568389'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "trigger_event" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "flowId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "sourceName" character varying NOT NULL,
                "fileId" character varying NOT NULL,
                CONSTRAINT "PK_79bbc8c2af95776e801c7eaab11" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_event_project_id_flow_id" ON "trigger_event" ("projectId", "flowId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_event_flow_id" ON "trigger_event" ("flowId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_trigger_event_file_id" ON "trigger_event" ("fileId")
        `)
        await queryRunner.query(`
            CREATE TABLE "app_event_routing" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "appName" character varying NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "flowId" character varying(21) NOT NULL,
                "identifierValue" character varying NOT NULL,
                "event" character varying NOT NULL,
                CONSTRAINT "PK_2107df2b2faf9d50435f9d5acd7" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_app_event_routing_flow_id" ON "app_event_routing" ("flowId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_app_event_flow_id_project_id_appName_identifier_value_event" ON "app_event_routing" (
                "appName",
                "projectId",
                "flowId",
                "identifierValue",
                "event"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_app_event_appName_identifier_event" ON "app_event_routing" ("appName", "identifierValue", "event")
        `)
        await queryRunner.query(`
            CREATE TABLE "file" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21),
                "platformId" character varying(21),
                "data" bytea,
                "location" character varying NOT NULL,
                "fileName" character varying,
                "size" integer,
                "metadata" jsonb,
                "s3Key" character varying,
                "type" character varying NOT NULL DEFAULT 'UNKNOWN',
                "compression" character varying NOT NULL DEFAULT 'NONE',
                CONSTRAINT "PK_36b46d232307066b3a2c9ea3a1d" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_file_project_id" ON "file" ("projectId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_file_type_created_desc" ON "file" ("type", "created")
        `)
        await queryRunner.query(`
            CREATE TABLE "flag" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "value" jsonb NOT NULL,
                CONSTRAINT "PK_17b74257294fdfd221178a132d4" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE TABLE "flow" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "folderId" character varying(21),
                "status" character varying NOT NULL DEFAULT 'DISABLED',
                "externalId" character varying NOT NULL,
                "publishedVersionId" character varying(21),
                "metadata" jsonb,
                "operationStatus" character varying NOT NULL DEFAULT 'NONE',
                "timeSavedPerRun" integer,
                "ownerId" character varying,
                "templateId" character varying,
                "createdBy" jsonb,
                CONSTRAINT "UQ_f6608fe13b916017a8202f993cb" UNIQUE ("publishedVersionId"),
                CONSTRAINT "REL_f6608fe13b916017a8202f993c" UNIQUE ("publishedVersionId"),
                CONSTRAINT "PK_6c2ad4a3e86394cd9bb7a80a228" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_flow_project_id" ON "flow" ("projectId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_flow_owner_id" ON "flow" ("ownerId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_flow_folder_id" ON "flow" ("folderId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_flow_project_id_status" ON "flow" ("projectId", "status")
        `)
        await queryRunner.query(`
            CREATE TABLE "flow_version" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "flowId" character varying(21) NOT NULL,
                "displayName" character varying NOT NULL,
                "schemaVersion" character varying,
                "trigger" jsonb,
                "connectionIds" character varying array NOT NULL,
                "agentIds" character varying array NOT NULL,
                "updatedBy" character varying,
                "valid" boolean NOT NULL,
                "state" character varying NOT NULL,
                "backupFiles" jsonb,
                "notes" jsonb NOT NULL,
                CONSTRAINT "PK_2f20a52dcddf98d3fafe621a9f5" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_flow_version_flow_id_created_desc" ON "flow_version" ("flowId", "created")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_flow_version_schema_version" ON "flow_version" ("schemaVersion")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_flow_version_updated_by" ON "flow_version" ("updatedBy")
        `)
        await queryRunner.query(`
            CREATE TABLE "flow_run" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "flowId" character varying(21) NOT NULL,
                "flowVersionId" character varying(21) NOT NULL,
                "environment" character varying,
                "logsFileId" character varying(21),
                "parentRunId" character varying(21),
                "failParentOnFailure" boolean NOT NULL DEFAULT true,
                "status" character varying NOT NULL,
                "tags" character varying array,
                "startTime" TIMESTAMP WITH TIME ZONE,
                "triggeredBy" character varying,
                "finishTime" TIMESTAMP WITH TIME ZONE,
                "failedStep" jsonb,
                "archivedAt" character varying,
                "stepNameToTest" character varying,
                "stepsCount" integer NOT NULL DEFAULT '0',
                "pauseMetadata" jsonb,
                CONSTRAINT "PK_858b1dd0d1055c44261ae00d45b" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_project_id_environment_flow_id_status_created_archived_" ON "flow_run" (
                "projectId",
                "environment",
                "flowId",
                "status",
                "created",
                "archivedAt"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_project_id_environment_status_created_archived_at" ON "flow_run" (
                "projectId",
                "environment",
                "status",
                "created",
                "archivedAt"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_project_id_environment_created_archived_at" ON "flow_run" (
                "projectId",
                "environment",
                "created",
                "archivedAt"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_project_id_environment_created_status_archived_at" ON "flow_run" (
                "projectId",
                "environment",
                "created",
                "archivedAt",
                "status"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_project_id_environment_flow_id_created_archived_at" ON "flow_run" (
                "projectId",
                "environment",
                "flowId",
                "created",
                "archivedAt"
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_flow_id" ON "flow_run" ("flowId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_logs_file_id" ON "flow_run" ("logsFileId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_parent_run_id" ON "flow_run" ("parentRunId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_flow_version_id" ON "flow_run" ("flowVersionId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_run_triggered_by" ON "flow_run" ("triggeredBy")
        `)
        await queryRunner.query(`
            CREATE TABLE "project" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted" TIMESTAMP WITH TIME ZONE,
                "ownerId" character varying(21) NOT NULL,
                "displayName" character varying NOT NULL,
                "type" character varying NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "externalId" character varying,
                "maxConcurrentJobs" integer,
                "icon" jsonb NOT NULL,
                "releasesEnabled" boolean NOT NULL DEFAULT false,
                "metadata" jsonb,
                "poolId" character varying(21),
                CONSTRAINT "PK_4d68b1358bb5b766d3e78f32f57" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_owner_id" ON "project" ("ownerId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_project_platform_id_external_id" ON "project" ("platformId", "externalId")
            WHERE deleted IS NULL
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_platform_id" ON "project" ("platformId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_pool_id" ON "project" ("poolId")
        `)
        await queryRunner.query(`
            CREATE TABLE "store-entry" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "key" character varying(128) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "value" jsonb,
                CONSTRAINT "UQ_6f251cc141de0a8d84d7a4ac17d" UNIQUE ("projectId", "key"),
                CONSTRAINT "PK_afb44ca7c0b4606b19deb1680d6" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE TABLE "user" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "status" character varying NOT NULL,
                "platformRole" character varying NOT NULL,
                "identityId" character varying NOT NULL,
                "externalId" character varying,
                "platformId" character varying,
                "lastActiveDate" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_platform_id_email" ON "user" ("platformId", "identityId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_platform_id_external_id" ON "user" ("platformId", "externalId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_user_identity_id" ON "user" ("identityId")
        `)
        await queryRunner.query(`
            CREATE TABLE "app_connection" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "displayName" character varying NOT NULL,
                "externalId" character varying NOT NULL,
                "type" character varying NOT NULL,
                "status" character varying NOT NULL DEFAULT 'ACTIVE',
                "platformId" character varying NOT NULL,
                "blockName" character varying NOT NULL,
                "ownerId" character varying,
                "projectIds" character varying array NOT NULL,
                "scope" character varying NOT NULL,
                "value" jsonb NOT NULL,
                "metadata" jsonb,
                "blockVersion" character varying NOT NULL,
                "preSelectForNewProjects" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_9efa2d6633ecc57cc5adeafa039" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_app_connection_platform_id_and_external_id" ON "app_connection" ("platformId", "externalId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_app_connection_owner_id" ON "app_connection" ("ownerId")
        `)
        await queryRunner.query(`
            CREATE TABLE "variable" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "projectId" character varying NOT NULL,
                "platformId" character varying NOT NULL,
                "ownerId" character varying,
                "value" jsonb NOT NULL,
                "metadata" jsonb,
                CONSTRAINT "PK_f4e200785984484787e6b47e6fb" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_variable_project_id_and_name" ON "variable" ("projectId", "name")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_variable_owner_id" ON "variable" ("ownerId")
        `)
        await queryRunner.query(`
            CREATE TABLE "folder" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "displayName" character varying NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "displayOrder" integer NOT NULL DEFAULT '0',
                CONSTRAINT "PK_6278a41a706740c94c02e288df8" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_folder_project_id_display_name" ON "folder" ("projectId", "displayName")
        `)
        await queryRunner.query(`
            CREATE TABLE "block_metadata" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "authors" character varying array NOT NULL,
                "displayName" character varying NOT NULL,
                "logoUrl" character varying NOT NULL,
                "projectUsage" integer NOT NULL DEFAULT '0',
                "description" character varying,
                "platformId" character varying,
                "version" character varying NOT NULL,
                "minimumSupportedRelease" character varying NOT NULL,
                "maximumSupportedRelease" character varying NOT NULL,
                "auth" json,
                "actions" json NOT NULL,
                "triggers" json NOT NULL,
                "blockType" character varying NOT NULL,
                "categories" character varying array,
                "packageType" character varying NOT NULL,
                "archiveId" character varying(21),
                "i18n" json,
                CONSTRAINT "REL_b43d7b070f0fc309932d4cf016" UNIQUE ("archiveId"),
                CONSTRAINT "PK_b045821e9caf2be9aba520d96da" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_block_metadata_name_platform_id_version" ON "block_metadata" ("name", "version", "platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "platform" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "ownerId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "primaryColor" character varying NOT NULL,
                "logoIconUrl" character varying NOT NULL,
                "fullLogoUrl" character varying NOT NULL,
                "favIconUrl" character varying NOT NULL,
                "cloudAuthEnabled" boolean NOT NULL DEFAULT true,
                "googleAuthEnabled" boolean NOT NULL DEFAULT true,
                "filteredBlockNames" character varying array NOT NULL,
                "filteredBlockBehavior" character varying NOT NULL,
                "allowedAuthDomains" character varying array NOT NULL,
                "allowedEmbedOrigins" character varying array NOT NULL DEFAULT '{}',
                "ssoDomain" character varying,
                "ssoDomainVerification" jsonb,
                "enforceAllowedAuthDomains" boolean NOT NULL,
                "emailAuthEnabled" boolean NOT NULL,
                "federatedAuthProviders" jsonb NOT NULL,
                "pinnedBlocks" character varying array NOT NULL,
                CONSTRAINT "REL_94d6fd6494f0322c6f0e099141" UNIQUE ("ownerId"),
                CONSTRAINT "PK_c33d6abeebd214bd2850bfd6b8e" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_platform_sso_domain" ON "platform" ("ssoDomain")
            WHERE "ssoDomain" IS NOT NULL
        `)
        await queryRunner.query(`
            CREATE TABLE "secret_manager" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "providerId" character varying NOT NULL,
                "auth" jsonb,
                CONSTRAINT "PK_0ae8f80f081a7b8889212816aac" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_secret_manager_platform_id" ON "secret_manager" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "tag" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying NOT NULL,
                "name" character varying NOT NULL,
                CONSTRAINT "UQ_0aaf8e30187e0b89ebc9c4764ba" UNIQUE ("platformId", "name"),
                CONSTRAINT "PK_8e4052373c579afc1471f526760" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE TABLE "block_tag" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying NOT NULL,
                "blockName" character varying NOT NULL,
                "tagId" character varying NOT NULL,
                CONSTRAINT "UQ_84a810ed305b758e07fa57f604a" UNIQUE ("tagId", "blockName"),
                CONSTRAINT "PK_f06201adf8d82249e8f2f390426" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "tag_platformId" ON "block_tag" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "alert" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "channel" character varying NOT NULL,
                "receiver" character varying NOT NULL,
                CONSTRAINT "PK_ad91cad659a3536465d564a4b2f" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_alert_project_id_channel_receiver" ON "alert" ("projectId", "channel", "receiver")
        `)
        await queryRunner.query(`
            CREATE TABLE "user_invitation" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying NOT NULL,
                "type" character varying NOT NULL,
                "platformRole" character varying,
                "email" character varying NOT NULL,
                "projectId" character varying,
                "status" character varying NOT NULL,
                "projectRoleId" character varying,
                CONSTRAINT "PK_41026b90b70299ac5dc0183351a" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_invitation_email_platform_project" ON "user_invitation" ("email", "platformId", "projectId")
        `)
        await queryRunner.query(`
            CREATE TABLE "ai_provider" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "config" json NOT NULL,
                "auth" json NOT NULL,
                "provider" character varying NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "displayName" character varying NOT NULL,
                "enabledForChat" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_1046c2cb42f99614e1c7873744b" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_ai_provider_platform_id_provider" ON "ai_provider" ("platformId", "provider")
        `)
        await queryRunner.query(`
            CREATE TABLE "project_role" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "permissions" character varying array NOT NULL,
                "platformId" character varying(21),
                "type" character varying NOT NULL,
                CONSTRAINT "PK_5974798305ac81d4a7d23ab1c6a" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_role_platform_id" ON "project_role" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "table" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "folderId" character varying(21),
                "externalId" character varying NOT NULL,
                "trigger" character varying,
                "status" character varying,
                "projectId" character varying(21) NOT NULL,
                CONSTRAINT "PK_28914b55c485fc2d7a101b1b2a4" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_table_project_id_name" ON "table" ("projectId", "name")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_table_folder_id" ON "table" ("folderId")
        `)
        await queryRunner.query(`
            CREATE TABLE "field" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "type" character varying NOT NULL,
                "tableId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "externalId" character varying NOT NULL,
                "data" jsonb,
                CONSTRAINT "PK_39379bba786d7a75226b358f81e" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_field_project_id_table_id_name" ON "field" ("projectId", "tableId", "name")
        `)
        await queryRunner.query(`
            CREATE TABLE "record" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "tableId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                CONSTRAINT "PK_5cb1f4d1aff275cf9001f4343b9" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_record_project_id_table_id" ON "record" ("projectId", "tableId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_record_table_id_project_id_record_id" ON "record" ("tableId", "projectId", "id")
        `)
        await queryRunner.query(`
            CREATE TABLE "cell" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "recordId" character varying(21) NOT NULL,
                "fieldId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "value" character varying NOT NULL,
                CONSTRAINT "PK_6f34717c251843e5ca32fc1b2b8" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_cell_project_id_field_id_record_id_unique" ON "cell" ("projectId", "fieldId", "recordId")
        `)
        await queryRunner.query(`
            CREATE TABLE "table_webhook" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "tableId" character varying(21) NOT NULL,
                "events" character varying array NOT NULL,
                "flowId" character varying(21) NOT NULL,
                CONSTRAINT "PK_69093ef390cfa098e6404cc85a8" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_table_webhook_flow_id" ON "table_webhook" ("flowId")
        `)
        await queryRunner.query(`
            CREATE TABLE "user_identity" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "email" character varying NOT NULL,
                "password" character varying NOT NULL,
                "trackEvents" boolean,
                "newsLetter" boolean,
                "verified" boolean NOT NULL DEFAULT false,
                "firstName" character varying NOT NULL,
                "lastName" character varying NOT NULL,
                "tokenVersion" character varying,
                "provider" character varying NOT NULL,
                "imageUrl" character varying,
                "lastLoggedInPlatformId" character varying(21),
                CONSTRAINT "UQ_7ad44f9fcbfc95e0a8436bbb029" UNIQUE ("email"),
                CONSTRAINT "PK_87b5856b206b5b77e6e2fa29508" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_user_identity_email" ON "user_identity" ("email")
        `)
        await queryRunner.query(`
            CREATE TABLE "mcp_server" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21),
                "projectId" character varying(21),
                "type" character varying NOT NULL,
                "token" character varying NOT NULL,
                "disabledTools" jsonb,
                CONSTRAINT "PK_940f98ed91dd060f63e6fc5634e" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "mcp_server_project_id" ON "mcp_server" ("projectId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_server_token" ON "mcp_server" ("token")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_server_platform_id" ON "mcp_server" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "mcp_oauth_client" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "clientId" character varying(64) NOT NULL,
                "clientSecret" character varying(128),
                "clientSecretExpiresAt" bigint NOT NULL DEFAULT '0',
                "clientIdIssuedAt" bigint NOT NULL,
                "redirectUris" character varying array NOT NULL,
                "clientName" character varying(255),
                "grantTypes" character varying array NOT NULL,
                "tokenEndpointAuthMethod" character varying(64) NOT NULL DEFAULT 'none',
                CONSTRAINT "PK_779bfe67dd46793eaf526e1bc21" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_oauth_client_client_id" ON "mcp_oauth_client" ("clientId")
        `)
        await queryRunner.query(`
            CREATE TABLE "mcp_oauth_authorization_code" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "code" character varying(128) NOT NULL,
                "clientId" character varying(64) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "projectId" character varying(21),
                "platformId" character varying(21) NOT NULL,
                "redirectUri" character varying(2048) NOT NULL,
                "codeChallenge" character varying(256) NOT NULL,
                "codeChallengeMethod" character varying(8) NOT NULL DEFAULT 'S256',
                "scopes" character varying array,
                "state" character varying(512),
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "used" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_bd8f45fa3a75c4fc0792eb0091a" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_oauth_code" ON "mcp_oauth_authorization_code" ("code")
        `)
        await queryRunner.query(`
            CREATE TABLE "mcp_oauth_token" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "refreshToken" character varying(128) NOT NULL,
                "clientId" character varying(64) NOT NULL,
                "userId" character varying(21) NOT NULL,
                "projectId" character varying(21),
                "platformId" character varying(21) NOT NULL,
                "scopes" character varying array,
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_45168e6e2a99c74779e45fab66b" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_mcp_oauth_token_refresh" ON "mcp_oauth_token" ("refreshToken")
        `)
        await queryRunner.query(`
            CREATE TABLE "knowledge_base_file" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "fileId" character varying(21) NOT NULL,
                "displayName" character varying NOT NULL,
                CONSTRAINT "PK_afc2936cc4a553a4d9f2c4411b6" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_kb_file_project_id" ON "knowledge_base_file" ("projectId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_kb_file_file_id" ON "knowledge_base_file" ("fileId")
        `)
        await queryRunner.query(`
            CREATE TABLE "knowledge_base_chunk" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "knowledgeBaseFileId" character varying(21) NOT NULL,
                "content" text NOT NULL,
                "chunkIndex" integer NOT NULL,
                "embedding" vector(768),
                "metadata" jsonb,
                CONSTRAINT "PK_09783ac5e458d44ec8e6b9ec509" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_kb_chunk_project_file" ON "knowledge_base_chunk" ("projectId", "knowledgeBaseFileId")
        `)
        await queryRunner.query(`
            CREATE TABLE "chat_conversation" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "projectId" character varying(21),
                "userId" character varying(21) NOT NULL,
                "title" character varying,
                "modelName" character varying,
                "status" character varying NOT NULL,
                "messages" jsonb NOT NULL,
                "uiMessages" jsonb,
                "summary" character varying,
                "summarizedUpToIndex" integer,
                CONSTRAINT "PK_0c5b7697e69f674eb983b1e83cc" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_chat_conversation_project_id_user_id" ON "chat_conversation" ("projectId", "userId")
        `)
        await queryRunner.query(`
            CREATE TABLE "trigger_source" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted" TIMESTAMP WITH TIME ZONE,
                "flowId" character varying NOT NULL,
                "flowVersionId" character varying NOT NULL,
                "triggerName" character varying NOT NULL,
                "projectId" character varying NOT NULL,
                "type" character varying NOT NULL,
                "schedule" jsonb,
                "blockName" character varying NOT NULL,
                "blockVersion" character varying NOT NULL,
                "simulate" boolean NOT NULL,
                CONSTRAINT "PK_aaccba5b6e8aa2f14f108504508" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_trigger_project_id_flow_id_simulate" ON "trigger_source" ("projectId", "flowId", "simulate")
            WHERE deleted IS NULL
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_trigger_flow_id_simulate" ON "trigger_source" ("flowId", "simulate")
            WHERE deleted IS NULL
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_flow_id" ON "trigger_source" ("flowId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_project_id" ON "trigger_source" ("projectId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_trigger_flow_version_id" ON "trigger_source" ("flowVersionId")
            WHERE deleted IS NULL
        `)
        await queryRunner.query(`
            CREATE TABLE "user_badge" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "userId" character varying(21) NOT NULL,
                CONSTRAINT "idx_user_badge_user_id_name" UNIQUE ("userId", "name"),
                CONSTRAINT "PK_c5db2542e028558c5306c9d7f42" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_user_badge_user_id" ON "user_badge" ("userId")
        `)
        await queryRunner.query(`
            CREATE TABLE "waitpoint" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "flowRunId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "type" character varying NOT NULL,
                "status" character varying NOT NULL,
                "resumeDateTime" TIMESTAMP WITH TIME ZONE,
                "responseToSend" jsonb,
                "workerHandlerId" character varying,
                "httpRequestId" character varying,
                "version" character varying NOT NULL DEFAULT 'V0',
                "stepName" character varying NOT NULL DEFAULT '',
                "resumePayload" jsonb,
                CONSTRAINT "PK_f29902394112e903241ae633a13" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_waitpoint_flow_run_id_step_name" ON "waitpoint" ("flowRunId", "stepName")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_waitpoint_project_id" ON "waitpoint" ("projectId")
        `)
        await queryRunner.query(`
            CREATE TABLE "concurrency_pool" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "key" character varying NOT NULL,
                "maxConcurrentJobs" integer NOT NULL,
                CONSTRAINT "PK_8b6ddf189ac8d0971b198a5b1c2" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_concurrency_pool_platform_id_key" ON "concurrency_pool" ("platformId", "key")
        `)
        await queryRunner.query(`
            CREATE TABLE "project_member" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "userId" character varying(21) NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "projectRoleId" character varying(21) NOT NULL,
                CONSTRAINT "PK_64dba8e9dcf96ce383cfd19d6fb" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_project_member_project_id_user_id_platform_id" ON "project_member" ("projectId", "userId", "platformId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_member_user_id_platform_id" ON "project_member" ("userId", "platformId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_member_project_role_id" ON "project_member" ("projectRoleId")
        `)
        await queryRunner.query(`
            CREATE TABLE "project_plan" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "locked" boolean NOT NULL,
                "name" character varying NOT NULL,
                "blocksFilterType" character varying NOT NULL,
                "blocks" character varying array NOT NULL,
                CONSTRAINT "PK_759d33fce71c95de832df935841" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_project_plan_project_id" ON "project_plan" ("projectId")
        `)
        await queryRunner.query(`
            CREATE TABLE "signing_key" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "publicKey" character varying NOT NULL,
                "privateKey" character varying NOT NULL,
                "displayName" character varying NOT NULL,
                "algorithm" character varying NOT NULL,
                CONSTRAINT "PK_5cc161da020c79bb3ac9953edae" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_signing_key_platform_id" ON "signing_key" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "oauth_app" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "blockName" character varying NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "clientId" character varying NOT NULL,
                "clientSecret" character varying NOT NULL,
                CONSTRAINT "PK_3256b97c0a3ee2d67240805dca4" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_oauth_app_platform_id_block_name" ON "oauth_app" ("platformId", "blockName")
        `)
        await queryRunner.query(`
            CREATE TABLE "otp" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "type" character varying NOT NULL,
                "identityId" character varying(21) NOT NULL,
                "value" character varying NOT NULL,
                "state" character varying NOT NULL,
                CONSTRAINT "PK_32556d9d7b22031d7d0e1fd6723" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_otp_identity_id_type" ON "otp" ("identityId", "type")
        `)
        await queryRunner.query(`
            CREATE TABLE "api_key" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "displayName" character varying NOT NULL,
                "hashedValue" character varying NOT NULL,
                "truncatedValue" character varying NOT NULL,
                "lastUsedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_b1bd840641b8acbaad89c3d8d11" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_api_key_platform_id" ON "api_key" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "template" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "name" character varying NOT NULL,
                "summary" character varying NOT NULL,
                "description" character varying NOT NULL,
                "type" character varying NOT NULL,
                "platformId" character varying,
                "status" character varying NOT NULL,
                "flows" jsonb,
                "tables" jsonb,
                "tags" jsonb NOT NULL,
                "blogUrl" character varying,
                "metadata" jsonb,
                "author" character varying NOT NULL,
                "categories" character varying array NOT NULL,
                "blocks" character varying array NOT NULL,
                CONSTRAINT "PK_fbae2ac36bd9b5e1e793b957b7f" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_template_blocks" ON "template" ("blocks")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_template_categories" ON "template" ("categories")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_template_platform_id" ON "template" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "git_repo" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "remoteUrl" character varying NOT NULL,
                "branch" character varying NOT NULL,
                "branchType" character varying NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "sshPrivateKey" character varying,
                "slug" character varying NOT NULL,
                CONSTRAINT "PK_de881ac6eac39e4d9ba7c5ed3e6" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_git_repo_project_id" ON "git_repo" ("projectId")
        `)
        await queryRunner.query(`
            CREATE TABLE "audit_event" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "projectId" character varying,
                "projectDisplayName" character varying,
                "action" character varying NOT NULL,
                "userId" character varying,
                "userEmail" character varying,
                "ip" character varying,
                "data" jsonb NOT NULL,
                CONSTRAINT "PK_481efbe8b0a403efe3f47a6528f" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_audit_event_platform_id" ON "audit_event" ("platformId")
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_audit_event_platform_id_project_id" ON "audit_event" ("platformId", "projectId")
        `)
        await queryRunner.query(`
            CREATE TABLE "project_release" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "name" character varying NOT NULL,
                "description" character varying,
                "importedBy" character varying(21),
                "fileId" character varying(21) NOT NULL,
                "type" character varying NOT NULL,
                CONSTRAINT "PK_11aa4566a8a7a623e5c3f9809fe" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_project_release_project_id" ON "project_release" ("projectId")
        `)
        await queryRunner.query(`
            CREATE TABLE "platform_analytics_report" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying NOT NULL,
                "outdated" boolean NOT NULL,
                "cachedAt" TIMESTAMP NOT NULL,
                "runs" jsonb NOT NULL,
                "flows" jsonb NOT NULL,
                "users" jsonb NOT NULL,
                CONSTRAINT "PK_8b060dc8b2e5d9d91162ce2cc11" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_platform_analytics_report_platform_id" ON "platform_analytics_report" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "embed_subdomain" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "hostname" character varying NOT NULL,
                "status" character varying NOT NULL,
                "cloudflareId" character varying NOT NULL,
                "verificationRecords" jsonb NOT NULL,
                CONSTRAINT "PK_6070f7161f4c6960d2774dc9a86" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_embed_subdomain_platform_id" ON "embed_subdomain" ("platformId")
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_embed_subdomain_hostname" ON "embed_subdomain" ("hostname")
        `)
        await queryRunner.query(`
            CREATE TABLE "connection_key" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "settings" jsonb NOT NULL,
                CONSTRAINT "PK_4dcf1d9ae4ba5eb261a6c775ad2" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_connection_key_project_id" ON "connection_key" ("projectId")
        `)
        await queryRunner.query(`
            CREATE TABLE "app_credential" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "appName" character varying NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "settings" jsonb NOT NULL,
                CONSTRAINT "PK_62eb102bb75a05d2951796a3b46" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_app_credential_project_id_app_name" ON "app_credential" ("projectId", "appName")
        `)
        await queryRunner.query(`
            CREATE TABLE "platform_plan" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "plan" character varying,
                "includedAiCredits" integer NOT NULL,
                "lastFreeAiCreditsRenewalDate" TIMESTAMP WITH TIME ZONE,
                "tablesEnabled" boolean NOT NULL,
                "eventStreamingEnabled" boolean NOT NULL,
                "aiCreditsAutoTopUpState" character varying NOT NULL,
                "aiCreditsAutoTopUpThreshold" integer,
                "aiCreditsAutoTopUpCreditsToAdd" integer,
                "maxAutoTopUpCreditsMonthly" integer,
                "environmentsEnabled" boolean NOT NULL,
                "analyticsEnabled" boolean NOT NULL,
                "showPoweredBy" boolean NOT NULL,
                "auditLogEnabled" boolean NOT NULL,
                "embeddingEnabled" boolean NOT NULL,
                "agentsEnabled" boolean NOT NULL,
                "aiProvidersEnabled" boolean NOT NULL,
                "chatEnabled" boolean NOT NULL,
                "dataManipulationEnabled" boolean NOT NULL,
                "manageBlocksEnabled" boolean NOT NULL,
                "manageTemplatesEnabled" boolean NOT NULL,
                "customAppearanceEnabled" boolean NOT NULL,
                "teamProjectsLimit" character varying NOT NULL,
                "projectRolesEnabled" boolean NOT NULL,
                "globalConnectionsEnabled" boolean NOT NULL,
                "customRolesEnabled" boolean NOT NULL,
                "apiKeysEnabled" boolean NOT NULL,
                "ssoEnabled" boolean NOT NULL,
                "secretManagersEnabled" boolean NOT NULL,
                "scimEnabled" boolean NOT NULL,
                "licenseKey" character varying,
                "licenseExpiresAt" TIMESTAMP WITH TIME ZONE,
                "stripeCustomerId" character varying,
                "stripeSubscriptionId" character varying,
                "stripeSubscriptionStatus" character varying,
                "stripeSubscriptionStartDate" integer,
                "stripeSubscriptionEndDate" integer,
                "stripeSubscriptionCancelDate" integer,
                "projectsLimit" integer,
                "activeFlowsLimit" integer,
                "dedicatedWorkers" jsonb,
                "canary" boolean NOT NULL,
                "customDomainsEnabled" boolean NOT NULL,
                "workerGroupId" character varying,
                CONSTRAINT "PK_d08fdd63b2b6e31d68b0134977f" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "idx_platform_plan_platform_id" ON "platform_plan" ("platformId")
        `)
        await queryRunner.query(`
            CREATE TABLE "event_destination" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "platformId" character varying(21) NOT NULL,
                "projectId" character varying(21),
                "scope" character varying NOT NULL,
                "events" character varying array NOT NULL,
                "url" character varying NOT NULL,
                CONSTRAINT "PK_e0fe710f7b5b768b59270f7ac05" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_event_destination_platform_scope" ON "event_destination" ("platformId")
            WHERE scope = 'PLATFORM'
        `)
        await queryRunner.query(`
            CREATE INDEX "idx_event_destination_project_scope" ON "event_destination" ("projectId")
            WHERE scope = 'PROJECT'
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event"
            ADD CONSTRAINT "fk_trigger_event_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event"
            ADD CONSTRAINT "fk_trigger_event_file_id" FOREIGN KEY ("fileId") REFERENCES "file"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event"
            ADD CONSTRAINT "fk_trigger_event_flow_id" FOREIGN KEY ("flowId") REFERENCES "flow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "file"
            ADD CONSTRAINT "fk_file_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow"
            ADD CONSTRAINT "fk_flow_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow"
            ADD CONSTRAINT "fk_flow_folder_id" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow"
            ADD CONSTRAINT "fk_flow_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow"
            ADD CONSTRAINT "fk_flow_published_version" FOREIGN KEY ("publishedVersionId") REFERENCES "flow_version"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_version"
            ADD CONSTRAINT "fk_updated_by_user_flow" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_version"
            ADD CONSTRAINT "fk_flow_version_flow" FOREIGN KEY ("flowId") REFERENCES "flow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run"
            ADD CONSTRAINT "fk_flow_run_triggered_by_user_id" FOREIGN KEY ("triggeredBy") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run"
            ADD CONSTRAINT "fk_flow_run_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run"
            ADD CONSTRAINT "fk_flow_run_flow_id" FOREIGN KEY ("flowId") REFERENCES "flow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run"
            ADD CONSTRAINT "fk_flow_run_flow_version_id" FOREIGN KEY ("flowVersionId") REFERENCES "flow_version"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run"
            ADD CONSTRAINT "fk_flow_run_logs_file_id" FOREIGN KEY ("logsFileId") REFERENCES "file"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "project"
            ADD CONSTRAINT "fk_project_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "project"
            ADD CONSTRAINT "fk_project_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "project"
            ADD CONSTRAINT "fk_project_pool_id" FOREIGN KEY ("poolId") REFERENCES "concurrency_pool"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "FK_dea97e26c765a4cdb575957a146" FOREIGN KEY ("identityId") REFERENCES "user_identity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "app_connection"
            ADD CONSTRAINT "fk_app_connection_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "variable"
            ADD CONSTRAINT "fk_variable_owner_id" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "folder"
            ADD CONSTRAINT "fk_folder_project" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "block_metadata"
            ADD CONSTRAINT "fk_block_metadata_file" FOREIGN KEY ("archiveId") REFERENCES "file"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "platform"
            ADD CONSTRAINT "fk_platform_user" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "secret_manager"
            ADD CONSTRAINT "fk_secret_manager_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "tag"
            ADD CONSTRAINT "FK_9dec09e187398715b7f1e32a6cb" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "block_tag"
            ADD CONSTRAINT "FK_6ee5c7cca2b33700e400ea2703e" FOREIGN KEY ("tagId") REFERENCES "tag"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "block_tag"
            ADD CONSTRAINT "FK_5f483919deb37416ff32594918a" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "alert"
            ADD CONSTRAINT "fk_alert_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "user_invitation"
            ADD CONSTRAINT "fk_user_invitation_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "user_invitation"
            ADD CONSTRAINT "fk_user_invitation_project_role_id" FOREIGN KEY ("projectRoleId") REFERENCES "project_role"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "ai_provider"
            ADD CONSTRAINT "fk_ai_provider_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "project_role"
            ADD CONSTRAINT "fk_project_role_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "table"
            ADD CONSTRAINT "fk_table_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "table"
            ADD CONSTRAINT "fk_table_folder_id" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "field"
            ADD CONSTRAINT "fk_field_table_id" FOREIGN KEY ("tableId") REFERENCES "table"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "field"
            ADD CONSTRAINT "fk_field_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "record"
            ADD CONSTRAINT "fk_record_table_id" FOREIGN KEY ("tableId") REFERENCES "table"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "record"
            ADD CONSTRAINT "fk_record_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "cell"
            ADD CONSTRAINT "fk_cell_record_id" FOREIGN KEY ("recordId") REFERENCES "record"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "cell"
            ADD CONSTRAINT "fk_cell_field_id" FOREIGN KEY ("fieldId") REFERENCES "field"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "cell"
            ADD CONSTRAINT "fk_cell_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "table_webhook"
            ADD CONSTRAINT "fk_table_webhook_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "table_webhook"
            ADD CONSTRAINT "fk_table_webhook_table_id" FOREIGN KEY ("tableId") REFERENCES "table"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "table_webhook"
            ADD CONSTRAINT "fk_table_webhook_flow_id" FOREIGN KEY ("flowId") REFERENCES "flow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_server"
            ADD CONSTRAINT "fk_mcp_server_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_server"
            ADD CONSTRAINT "FK_dd85c7c51f3c8137aecb1cafd34" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "knowledge_base_file"
            ADD CONSTRAINT "fk_kb_file_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "knowledge_base_file"
            ADD CONSTRAINT "fk_kb_file_file_id" FOREIGN KEY ("fileId") REFERENCES "file"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "knowledge_base_chunk"
            ADD CONSTRAINT "fk_kb_chunk_kb_file_id" FOREIGN KEY ("knowledgeBaseFileId") REFERENCES "knowledge_base_file"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_conversation"
            ADD CONSTRAINT "fk_chat_conversation_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_conversation"
            ADD CONSTRAINT "fk_chat_conversation_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_conversation"
            ADD CONSTRAINT "fk_chat_conversation_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_source"
            ADD CONSTRAINT "FK_3d3024c914f2fbf4f9e25029816" FOREIGN KEY ("flowId") REFERENCES "flow"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_source"
            ADD CONSTRAINT "FK_5f28d74a4fdaf3fc91e6a0e7450" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "user_badge"
            ADD CONSTRAINT "FK_dc6bb11dce7a0a591b5cae0af25" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "waitpoint"
            ADD CONSTRAINT "fk_waitpoint_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "concurrency_pool"
            ADD CONSTRAINT "fk_concurrency_pool_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "project_member"
            ADD CONSTRAINT "fk_project_member_user_id" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "project_member"
            ADD CONSTRAINT "fk_project_member_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "project_member"
            ADD CONSTRAINT "fk_project_member_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "project_member"
            ADD CONSTRAINT "fk_project_member_project_role_id" FOREIGN KEY ("projectRoleId") REFERENCES "project_role"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "project_plan"
            ADD CONSTRAINT "fk_project_plan_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "signing_key"
            ADD CONSTRAINT "fk_signing_key_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "oauth_app"
            ADD CONSTRAINT "fk_oauth_app_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "otp"
            ADD CONSTRAINT "fk_otp_user_identity_id" FOREIGN KEY ("identityId") REFERENCES "user_identity"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "api_key"
            ADD CONSTRAINT "fk_api_key_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "template"
            ADD CONSTRAINT "fk_template_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "git_repo"
            ADD CONSTRAINT "fk_git_repo_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "audit_event"
            ADD CONSTRAINT "fk_audit_event_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "project_release"
            ADD CONSTRAINT "fk_project_release_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "platform_analytics_report"
            ADD CONSTRAINT "fk_platform_analytics_report_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "embed_subdomain"
            ADD CONSTRAINT "fk_embed_subdomain_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "connection_key"
            ADD CONSTRAINT "fk_connection_key_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "app_credential"
            ADD CONSTRAINT "fk_app_credential_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "platform_plan"
            ADD CONSTRAINT "fk_platform_plan_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE RESTRICT
        `)
        await queryRunner.query(`
            ALTER TABLE "event_destination"
            ADD CONSTRAINT "fk_event_destination_platform_id" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
        await queryRunner.query(`
            ALTER TABLE "event_destination"
            ADD CONSTRAINT "fk_event_destination_project_id" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "event_destination" DROP CONSTRAINT "fk_event_destination_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "event_destination" DROP CONSTRAINT "fk_event_destination_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "platform_plan" DROP CONSTRAINT "fk_platform_plan_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "app_credential" DROP CONSTRAINT "fk_app_credential_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "connection_key" DROP CONSTRAINT "fk_connection_key_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "embed_subdomain" DROP CONSTRAINT "fk_embed_subdomain_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "platform_analytics_report" DROP CONSTRAINT "fk_platform_analytics_report_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_release" DROP CONSTRAINT "fk_project_release_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "audit_event" DROP CONSTRAINT "fk_audit_event_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "git_repo" DROP CONSTRAINT "fk_git_repo_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "template" DROP CONSTRAINT "fk_template_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "api_key" DROP CONSTRAINT "fk_api_key_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "otp" DROP CONSTRAINT "fk_otp_user_identity_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "oauth_app" DROP CONSTRAINT "fk_oauth_app_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "signing_key" DROP CONSTRAINT "fk_signing_key_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_plan" DROP CONSTRAINT "fk_project_plan_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_member" DROP CONSTRAINT "fk_project_member_project_role_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_member" DROP CONSTRAINT "fk_project_member_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_member" DROP CONSTRAINT "fk_project_member_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_member" DROP CONSTRAINT "fk_project_member_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "concurrency_pool" DROP CONSTRAINT "fk_concurrency_pool_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "waitpoint" DROP CONSTRAINT "fk_waitpoint_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "user_badge" DROP CONSTRAINT "FK_dc6bb11dce7a0a591b5cae0af25"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_source" DROP CONSTRAINT "FK_5f28d74a4fdaf3fc91e6a0e7450"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_source" DROP CONSTRAINT "FK_3d3024c914f2fbf4f9e25029816"
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_conversation" DROP CONSTRAINT "fk_chat_conversation_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_conversation" DROP CONSTRAINT "fk_chat_conversation_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "chat_conversation" DROP CONSTRAINT "fk_chat_conversation_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "knowledge_base_chunk" DROP CONSTRAINT "fk_kb_chunk_kb_file_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "knowledge_base_file" DROP CONSTRAINT "fk_kb_file_file_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "knowledge_base_file" DROP CONSTRAINT "fk_kb_file_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_server" DROP CONSTRAINT "FK_dd85c7c51f3c8137aecb1cafd34"
        `)
        await queryRunner.query(`
            ALTER TABLE "mcp_server" DROP CONSTRAINT "fk_mcp_server_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "table_webhook" DROP CONSTRAINT "fk_table_webhook_flow_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "table_webhook" DROP CONSTRAINT "fk_table_webhook_table_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "table_webhook" DROP CONSTRAINT "fk_table_webhook_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "cell" DROP CONSTRAINT "fk_cell_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "cell" DROP CONSTRAINT "fk_cell_field_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "cell" DROP CONSTRAINT "fk_cell_record_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "record" DROP CONSTRAINT "fk_record_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "record" DROP CONSTRAINT "fk_record_table_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "field" DROP CONSTRAINT "fk_field_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "field" DROP CONSTRAINT "fk_field_table_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "table" DROP CONSTRAINT "fk_table_folder_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "table" DROP CONSTRAINT "fk_table_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project_role" DROP CONSTRAINT "fk_project_role_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "ai_provider" DROP CONSTRAINT "fk_ai_provider_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "user_invitation" DROP CONSTRAINT "fk_user_invitation_project_role_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "user_invitation" DROP CONSTRAINT "fk_user_invitation_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "alert" DROP CONSTRAINT "fk_alert_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "block_tag" DROP CONSTRAINT "FK_5f483919deb37416ff32594918a"
        `)
        await queryRunner.query(`
            ALTER TABLE "block_tag" DROP CONSTRAINT "FK_6ee5c7cca2b33700e400ea2703e"
        `)
        await queryRunner.query(`
            ALTER TABLE "tag" DROP CONSTRAINT "FK_9dec09e187398715b7f1e32a6cb"
        `)
        await queryRunner.query(`
            ALTER TABLE "secret_manager" DROP CONSTRAINT "fk_secret_manager_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "platform" DROP CONSTRAINT "fk_platform_user"
        `)
        await queryRunner.query(`
            ALTER TABLE "block_metadata" DROP CONSTRAINT "fk_block_metadata_file"
        `)
        await queryRunner.query(`
            ALTER TABLE "folder" DROP CONSTRAINT "fk_folder_project"
        `)
        await queryRunner.query(`
            ALTER TABLE "variable" DROP CONSTRAINT "fk_variable_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "app_connection" DROP CONSTRAINT "fk_app_connection_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "user" DROP CONSTRAINT "FK_dea97e26c765a4cdb575957a146"
        `)
        await queryRunner.query(`
            ALTER TABLE "project" DROP CONSTRAINT "fk_project_pool_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project" DROP CONSTRAINT "fk_project_platform_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "project" DROP CONSTRAINT "fk_project_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run" DROP CONSTRAINT "fk_flow_run_logs_file_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run" DROP CONSTRAINT "fk_flow_run_flow_version_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run" DROP CONSTRAINT "fk_flow_run_flow_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run" DROP CONSTRAINT "fk_flow_run_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_run" DROP CONSTRAINT "fk_flow_run_triggered_by_user_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_version" DROP CONSTRAINT "fk_flow_version_flow"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow_version" DROP CONSTRAINT "fk_updated_by_user_flow"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow" DROP CONSTRAINT "fk_flow_published_version"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow" DROP CONSTRAINT "fk_flow_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow" DROP CONSTRAINT "fk_flow_folder_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "flow" DROP CONSTRAINT "fk_flow_owner_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "file" DROP CONSTRAINT "fk_file_project_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event" DROP CONSTRAINT "fk_trigger_event_flow_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event" DROP CONSTRAINT "fk_trigger_event_file_id"
        `)
        await queryRunner.query(`
            ALTER TABLE "trigger_event" DROP CONSTRAINT "fk_trigger_event_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_event_destination_project_scope"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_event_destination_platform_scope"
        `)
        await queryRunner.query(`
            DROP TABLE "event_destination"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_platform_plan_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "platform_plan"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_credential_project_id_app_name"
        `)
        await queryRunner.query(`
            DROP TABLE "app_credential"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_connection_key_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "connection_key"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_embed_subdomain_hostname"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_embed_subdomain_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "embed_subdomain"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_platform_analytics_report_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "platform_analytics_report"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_release_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "project_release"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_audit_event_platform_id_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_audit_event_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "audit_event"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_git_repo_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "git_repo"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_template_platform_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_template_categories"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_template_blocks"
        `)
        await queryRunner.query(`
            DROP TABLE "template"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_api_key_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "api_key"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_otp_identity_id_type"
        `)
        await queryRunner.query(`
            DROP TABLE "otp"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_oauth_app_platform_id_block_name"
        `)
        await queryRunner.query(`
            DROP TABLE "oauth_app"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_signing_key_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "signing_key"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_plan_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "project_plan"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_member_project_role_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_member_user_id_platform_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_member_project_id_user_id_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "project_member"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_concurrency_pool_platform_id_key"
        `)
        await queryRunner.query(`
            DROP TABLE "concurrency_pool"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_waitpoint_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_waitpoint_flow_run_id_step_name"
        `)
        await queryRunner.query(`
            DROP TABLE "waitpoint"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_badge_user_id"
        `)
        await queryRunner.query(`
            DROP TABLE "user_badge"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_flow_version_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_project_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_flow_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_flow_id_simulate"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_project_id_flow_id_simulate"
        `)
        await queryRunner.query(`
            DROP TABLE "trigger_source"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_chat_conversation_project_id_user_id"
        `)
        await queryRunner.query(`
            DROP TABLE "chat_conversation"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_kb_chunk_project_file"
        `)
        await queryRunner.query(`
            DROP TABLE "knowledge_base_chunk"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_kb_file_file_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_kb_file_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "knowledge_base_file"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_oauth_token_refresh"
        `)
        await queryRunner.query(`
            DROP TABLE "mcp_oauth_token"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_oauth_code"
        `)
        await queryRunner.query(`
            DROP TABLE "mcp_oauth_authorization_code"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_oauth_client_client_id"
        `)
        await queryRunner.query(`
            DROP TABLE "mcp_oauth_client"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_server_platform_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_mcp_server_token"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."mcp_server_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "mcp_server"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_identity_email"
        `)
        await queryRunner.query(`
            DROP TABLE "user_identity"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_table_webhook_flow_id"
        `)
        await queryRunner.query(`
            DROP TABLE "table_webhook"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_cell_project_id_field_id_record_id_unique"
        `)
        await queryRunner.query(`
            DROP TABLE "cell"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_record_table_id_project_id_record_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_record_project_id_table_id"
        `)
        await queryRunner.query(`
            DROP TABLE "record"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_field_project_id_table_id_name"
        `)
        await queryRunner.query(`
            DROP TABLE "field"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_table_folder_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_table_project_id_name"
        `)
        await queryRunner.query(`
            DROP TABLE "table"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_role_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "project_role"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_ai_provider_platform_id_provider"
        `)
        await queryRunner.query(`
            DROP TABLE "ai_provider"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_invitation_email_platform_project"
        `)
        await queryRunner.query(`
            DROP TABLE "user_invitation"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_alert_project_id_channel_receiver"
        `)
        await queryRunner.query(`
            DROP TABLE "alert"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."tag_platformId"
        `)
        await queryRunner.query(`
            DROP TABLE "block_tag"
        `)
        await queryRunner.query(`
            DROP TABLE "tag"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_secret_manager_platform_id"
        `)
        await queryRunner.query(`
            DROP TABLE "secret_manager"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_platform_sso_domain"
        `)
        await queryRunner.query(`
            DROP TABLE "platform"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_block_metadata_name_platform_id_version"
        `)
        await queryRunner.query(`
            DROP TABLE "block_metadata"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_folder_project_id_display_name"
        `)
        await queryRunner.query(`
            DROP TABLE "folder"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_variable_owner_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_variable_project_id_and_name"
        `)
        await queryRunner.query(`
            DROP TABLE "variable"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_connection_owner_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_connection_platform_id_and_external_id"
        `)
        await queryRunner.query(`
            DROP TABLE "app_connection"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_identity_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_platform_id_external_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_user_platform_id_email"
        `)
        await queryRunner.query(`
            DROP TABLE "user"
        `)
        await queryRunner.query(`
            DROP TABLE "store-entry"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_pool_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_platform_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_platform_id_external_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_owner_id"
        `)
        await queryRunner.query(`
            DROP TABLE "project"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_triggered_by"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_flow_version_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_parent_run_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_logs_file_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_flow_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_project_id_environment_flow_id_created_archived_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_project_id_environment_created_status_archived_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_project_id_environment_created_archived_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_project_id_environment_status_created_archived_at"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_run_project_id_environment_flow_id_status_created_archived_"
        `)
        await queryRunner.query(`
            DROP TABLE "flow_run"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_flow_version_updated_by"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_flow_version_schema_version"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_flow_version_flow_id_created_desc"
        `)
        await queryRunner.query(`
            DROP TABLE "flow_version"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_flow_project_id_status"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_flow_folder_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_flow_owner_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_flow_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "flow"
        `)
        await queryRunner.query(`
            DROP TABLE "flag"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_file_type_created_desc"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_file_project_id"
        `)
        await queryRunner.query(`
            DROP TABLE "file"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_event_appName_identifier_event"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_event_flow_id_project_id_appName_identifier_value_event"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_app_event_routing_flow_id"
        `)
        await queryRunner.query(`
            DROP TABLE "app_event_routing"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_event_file_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_event_flow_id"
        `)
        await queryRunner.query(`
            DROP INDEX "public"."idx_trigger_event_project_id_flow_id"
        `)
        await queryRunner.query(`
            DROP TABLE "trigger_event"
        `)
    }

}
