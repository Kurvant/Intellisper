// Clean-room entity. Field set derived from the MIT shared type `SigningKey`
// (packages/shared/.../ee/signing-key/signing-key-model.ts) — NOT from any licensed source.
//
// INTEGRITY GUARANTEE (spec D.1): the platform NEVER persists the private key. On generation the
// private key is returned to the caller exactly once (in the create response) and discarded; the
// row stores only the PUBLIC key, a display name, the algorithm, and the owning organization.
// The key↔organization relation is a foreign key so a key can never be orphaned from its
// organization.
import { KeyAlgorithm, Platform, SigningKey } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

type SigningKeySchema = SigningKey & {
    platform: Platform
}

export const SigningKeyEntity = new EntitySchema<SigningKeySchema>({
    name: 'signing_key',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        publicKey: {
            type: String,
            nullable: false,
        },
        displayName: {
            type: String,
            nullable: false,
        },
        algorithm: {
            type: String,
            enum: KeyAlgorithm,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_signing_key_platform_id',
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
                foreignKeyConstraintName: 'fk_signing_key_platform_id',
            },
        },
    },
})
