// Clean-room entity. Field set derived from the MIT shared type
// `ApplicationEvent` (packages/shared/.../ee/audit-events/index.ts), whose
// members share platformId/action/projectId/user fields plus an event-specific
// `data` payload — NOT from any licensed source.
import { ApplicationEvent, Platform } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

type AuditEventSchema = ApplicationEvent & {
    platform: Platform
}

export const AuditEventEntity = new EntitySchema<AuditEventSchema>({
    name: 'audit_event',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        projectId: {
            type: String,
            nullable: true,
        },
        projectDisplayName: {
            type: String,
            nullable: true,
        },
        action: {
            type: String,
            nullable: false,
        },
        userId: {
            type: String,
            nullable: true,
        },
        userEmail: {
            type: String,
            nullable: true,
        },
        ip: {
            type: String,
            nullable: true,
        },
        // Event-specific payload; shape varies by `action` (discriminated union).
        data: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_audit_event_platform_id',
            columns: ['platformId'],
            unique: false,
        },
        {
            name: 'idx_audit_event_platform_id_project_id',
            columns: ['platformId', 'projectId'],
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
                foreignKeyConstraintName: 'fk_audit_event_platform_id',
            },
        },
    },
})
