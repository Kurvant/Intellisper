// Clean-room entity. Field set derived from the MIT shared type `AppCredential`
// (packages/shared/.../ee/product-embed/app-credentials/app-credentials.ts).
// `settings` is a discriminated union (OAuth2 / API key) persisted as jsonb;
// it may contain secret material. NOT derived from any licensed source.
import { AppCredential, Project } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

type AppCredentialSchema = AppCredential & {
    project: Project
}

export const AppCredentialEntity = new EntitySchema<AppCredentialSchema>({
    name: 'app_credential',
    columns: {
        ...BaseColumnSchemaPart,
        appName: {
            type: String,
            nullable: false,
        },
        projectId: {
            ...IbIdSchema,
            nullable: false,
        },
        settings: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        // One credential per (project, app).
        {
            name: 'idx_app_credential_project_id_app_name',
            columns: ['projectId', 'appName'],
            unique: true,
        },
    ],
    relations: {
        project: {
            type: 'many-to-one',
            target: 'project',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_app_credential_project_id',
            },
        },
    },
})
