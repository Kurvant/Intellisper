// Clean-room entity. Field set derived from the MIT shared type `EmbedSubdomain`
// (packages/shared/.../ee/embed-subdomain/index.ts) — NOT from any licensed source.
import { EmbedSubdomain, EmbedSubdomainStatus, Platform } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

type EmbedSubdomainSchema = EmbedSubdomain & {
    platform: Platform
}

export const EmbedSubdomainEntity = new EntitySchema<EmbedSubdomainSchema>({
    name: 'embed_subdomain',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        hostname: {
            type: String,
            nullable: false,
        },
        status: {
            type: String,
            enum: EmbedSubdomainStatus,
            nullable: false,
        },
        cloudflareId: {
            type: String,
            nullable: false,
        },
        verificationRecords: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_embed_subdomain_platform_id',
            columns: ['platformId'],
            unique: true,
        },
        {
            name: 'idx_embed_subdomain_hostname',
            columns: ['hostname'],
            unique: true,
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
                foreignKeyConstraintName: 'fk_embed_subdomain_platform_id',
            },
        },
    },
})
