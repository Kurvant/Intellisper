// Clean-room entity — organization-provided OAuth client credentials (capability spec E.3).
// Field set derived from the MIT shared types `OAuthApp` and `UpsertOAuth2AppRequest`
// (packages/shared/.../ee/oauth-apps/oauth-app.ts) — NOT from any licensed source.
//
// The public `OAuthApp` exposes blockName/platformId/clientId. The client SECRET is sensitive
// and MUST be encrypted at rest (Part III "encryption at rest"): it is stored as an
// `EncryptedObject` in a jsonb column, never returned to clients, and decrypted only when the
// stored credentials are used in place of the platform defaults.
import { OAuthApp, Platform } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'
import { EncryptedObject } from '../../helper/encryption'

// The persisted row: the public app plus the encrypted client secret and the platform relation.
export type OAuthAppWithEncryptedSecret = OAuthApp & {
    clientSecret: EncryptedObject
}

type OAuthAppSchema = OAuthAppWithEncryptedSecret & {
    platform: Platform
}

export const OAuthAppEntity = new EntitySchema<OAuthAppSchema>({
    name: 'oauth_app',
    columns: {
        ...BaseColumnSchemaPart,
        blockName: {
            type: String,
            nullable: false,
        },
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        clientId: {
            type: String,
            nullable: false,
        },
        clientSecret: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        // One custom OAuth app per (platform, block).
        {
            name: 'idx_oauth_app_platform_id_block_name',
            columns: ['platformId', 'blockName'],
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
                foreignKeyConstraintName: 'fk_oauth_app_platform_id',
            },
        },
    },
})
