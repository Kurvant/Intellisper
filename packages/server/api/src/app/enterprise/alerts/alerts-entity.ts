// Clean-room entity. Field set derived from the MIT shared type `Alert`
// (packages/shared/.../ee/alerts/alerts-dto.ts) — NOT from any licensed source.
import { Alert, AlertChannel, Project } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { IbIdSchema, BaseColumnSchemaPart } from '../../database/database-common'

type AlertSchema = Alert & {
    project: Project
}

export const AlertEntity = new EntitySchema<AlertSchema>({
    name: 'alert',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            ...IbIdSchema,
            nullable: false,
        },
        channel: {
            type: String,
            enum: AlertChannel,
            nullable: false,
        },
        receiver: {
            type: String,
            nullable: false,
        },
    },
    indices: [
        // A receiver is registered at most once per project+channel.
        {
            name: 'idx_alert_project_id_channel_receiver',
            columns: ['projectId', 'channel', 'receiver'],
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
                foreignKeyConstraintName: 'fk_alert_project_id',
            },
        },
    },
})
