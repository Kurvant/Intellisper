// Clean-room entity. Field set derived from the MIT shared type `OtpModel`
// (packages/shared/.../ee/otp/otp-model.ts) — NOT from any licensed source.
import { OtpModel, OtpState, OtpType, UserIdentity } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../../database/database-common'

type OtpSchema = OtpModel & {
    identity: UserIdentity
}

export const OtpEntity = new EntitySchema<OtpSchema>({
    name: 'otp',
    columns: {
        ...BaseColumnSchemaPart,
        type: {
            type: String,
            enum: OtpType,
            nullable: false,
        },
        identityId: {
            ...IbIdSchema,
            nullable: false,
        },
        value: {
            type: String,
            nullable: false,
        },
        state: {
            type: String,
            enum: OtpState,
            nullable: false,
        },
    },
    indices: [
        // One active OTP per (identity, purpose).
        {
            name: 'idx_otp_identity_id_type',
            columns: ['identityId', 'type'],
            unique: true,
        },
    ],
    relations: {
        identity: {
            type: 'many-to-one',
            target: 'user_identity',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'identityId',
                foreignKeyConstraintName: 'fk_otp_user_identity_id',
            },
        },
    },
})
