// Clean-room entity — one row per completed chat message, the sole aggregatable source for the
// internal-admin chat analytics (capability spec H.2.m). Written fire-and-forget from the chat
// save path; NEVER read by tenants. No secret material is stored (provider/model are names only).
//
// There is deliberately NO conversation-snapshot table: conversation/ops views read the live
// chat_conversation table. This table exists only for cheap GROUP BY usage/billing aggregates, and
// is kept bounded by a scheduled retention prune.
import { Platform, Project, User } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { IbIdSchema, BaseColumnSchemaPart } from '../../../database/database-common'

export type ChatMessageMetric = {
    id: string
    created: string
    updated: string
    platformId: string
    projectId: string | null
    userId: string
    conversationId: string
    provider: string | null
    model: string | null
    toolsUsed: number
    messageChars: number | null
    licenseKey: string | null
}

type ChatMessageMetricSchema = ChatMessageMetric & {
    platform: Platform
    project: Project
    user: User
}

export const ChatMessageMetricEntity = new EntitySchema<ChatMessageMetricSchema>({
    name: 'chat_message_metric',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        projectId: {
            ...IbIdSchema,
            nullable: true,
        },
        userId: {
            ...IbIdSchema,
            nullable: false,
        },
        conversationId: {
            ...IbIdSchema,
            nullable: false,
        },
        provider: {
            type: String,
            nullable: true,
        },
        model: {
            type: String,
            nullable: true,
        },
        toolsUsed: {
            type: Number,
            nullable: false,
        },
        messageChars: {
            type: Number,
            nullable: true,
        },
        licenseKey: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_chat_message_metric_platform_created',
            columns: ['platformId', 'created'],
            unique: false,
        },
        {
            name: 'idx_chat_message_metric_user_created',
            columns: ['userId', 'created'],
            unique: false,
        },
        {
            name: 'idx_chat_message_metric_conversation_id',
            columns: ['conversationId'],
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
                foreignKeyConstraintName: 'fk_chat_message_metric_platform_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            nullable: true,
            onDelete: 'SET NULL',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_chat_message_metric_project_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_chat_message_metric_user_id',
            },
        },
    },
})
