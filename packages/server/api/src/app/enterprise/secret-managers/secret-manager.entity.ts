// Clean-room entity. A configured external secret-store connection, scoped to a platform
// (organization). `auth` holds the provider config ENCRYPTED at rest (an EncryptedObject
// serialized as jsonb — never the clear config). `scope` distinguishes an organization-wide
// store (PLATFORM) from a workspace-scoped one (PROJECT), whose `projectIds` lists the
// workspaces that may use it.
import { Platform, SecretManagerConnectionScope, SecretManagerProviderId } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { IbIdSchema, BaseColumnSchemaPart } from '../../database/database-common'
import { EncryptedObject } from '../../helper/encryption'

export type SecretManagerSchema = {
    id: string
    created: string
    updated: string
    platformId: string
    providerId: SecretManagerProviderId
    name: string
    scope: SecretManagerConnectionScope
    projectIds: string[] | null
    auth: EncryptedObject | null
    platform: Platform
}

export const SecretManagerEntity = new EntitySchema<SecretManagerSchema>({
    name: 'secret_manager',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        providerId: {
            type: String,
            nullable: false,
        },
        name: {
            type: String,
            nullable: false,
        },
        scope: {
            type: String,
            nullable: false,
        },
        projectIds: {
            type: 'jsonb',
            nullable: true,
        },
        auth: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_secret_manager_platform_id',
            columns: ['platformId'],
            unique: false,
        },
    ],
    relations: {
        platform: {
            type: 'many-to-one',
            target: 'platform',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_secret_manager_platform_id',
            },
        },
    },
})
