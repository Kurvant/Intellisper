// Clean-room entity. Field set derived from the MIT shared type `ChatConversation`
// (packages/shared/.../ee/chat/index.ts) — NOT from any licensed source.
import { ChatConversation, ChatConversationStatus, Platform, Project, User } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { IbIdSchema, BaseColumnSchemaPart } from '../../database/database-common'

type ChatConversationSchema = ChatConversation & {
    platform: Platform
    project: Project
    user: User
}

export const ChatConversationEntity = new EntitySchema<ChatConversationSchema>({
    name: 'chat_conversation',
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
        title: {
            type: String,
            nullable: true,
        },
        modelName: {
            type: String,
            nullable: true,
        },
        status: {
            type: String,
            enum: ChatConversationStatus,
            nullable: false,
        },
        messages: {
            type: 'jsonb',
            nullable: false,
        },
        uiMessages: {
            type: 'jsonb',
            nullable: true,
        },
        summary: {
            type: String,
            nullable: true,
        },
        summarizedUpToIndex: {
            type: Number,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_chat_conversation_project_id_user_id',
            columns: ['projectId', 'userId'],
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
                foreignKeyConstraintName: 'fk_chat_conversation_platform_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            nullable: true,
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_chat_conversation_project_id',
            },
        },
        user: {
            type: 'many-to-one',
            target: 'user',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'userId',
                foreignKeyConstraintName: 'fk_chat_conversation_user_id',
            },
        },
    },
})
