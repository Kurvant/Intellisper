// Clean-room entity. Field set derived from the MIT shared type `ApiKey`
// (packages/shared/.../ee/api-key/index.ts) — NOT from any licensed source.
import { ApiKey, Platform } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { IbIdSchema, BaseColumnSchemaPart } from '../../database/database-common'

type ApiKeySchema = ApiKey & {
    platform: Platform
}

export const ApiKeyEntity = new EntitySchema<ApiKeySchema>({
    name: 'api_key',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        displayName: {
            type: String,
            nullable: false,
        },
        // Only the hash is stored; the plaintext value is shown once at creation.
        hashedValue: {
            type: String,
            nullable: false,
        },
        truncatedValue: {
            type: String,
            nullable: false,
        },
        lastUsedAt: {
            type: 'timestamp with time zone',
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_api_key_platform_id',
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
                foreignKeyConstraintName: 'fk_api_key_platform_id',
            },
        },
    },
})
