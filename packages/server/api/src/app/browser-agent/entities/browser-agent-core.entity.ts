import {
    AgentAction,
    AgentConversation,
    AgentMessage,
    AgentRun,
} from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

// Relation-augmented schema types (mirrors FlowEntity): TypeORM's EntitySchema keys `relations`
// by the entity's own property names, so navigation properties must be present on the type.
type AgentMessageSchema = AgentMessage & { conversation: AgentConversation }
type AgentRunSchema = AgentRun & { conversation: AgentConversation }
type AgentActionSchema = AgentAction & { run: AgentRun }

/**
 * Browser-agent conversation/message/run/action tables. Every top-level row carries
 * platformId + userId (tenant + owner) so the scope helper can enforce the visibility predicate.
 * Child rows (message/action) inherit scope through their parent FK and are never queried
 * un-parented.
 */

export const AgentConversationEntity = new EntitySchema<AgentConversation>({
    name: 'browser_agent_conversation',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        projectId: { ...IbIdSchema, nullable: false },
        title: { type: String, nullable: true },
        deletedAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_conversation_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_conversation_project', columns: ['projectId'], unique: false },
    ],
})

export const AgentMessageEntity = new EntitySchema<AgentMessageSchema>({
    name: 'browser_agent_message',
    columns: {
        ...BaseColumnSchemaPart,
        conversationId: { ...IbIdSchema, nullable: false },
        role: { type: String, nullable: false },
        content: { type: 'text', nullable: false },
        toolCalls: { type: 'jsonb', nullable: true },
    },
    indices: [
        { name: 'idx_ba_message_conversation', columns: ['conversationId'], unique: false },
    ],
    relations: {
        conversation: {
            type: 'many-to-one',
            target: 'browser_agent_conversation',
            onDelete: 'CASCADE',
            nullable: false,
            joinColumn: {
                name: 'conversationId',
                foreignKeyConstraintName: 'fk_ba_message_conversation',
            },
        },
    },
})

export const AgentRunEntity = new EntitySchema<AgentRunSchema>({
    name: 'browser_agent_run',
    columns: {
        ...BaseColumnSchemaPart,
        conversationId: { ...IbIdSchema, nullable: false },
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        projectId: { ...IbIdSchema, nullable: false },
        status: { type: String, nullable: false },
        stepCount: { type: Number, nullable: false, default: 0 },
        tokenCost: { type: 'bigint', nullable: false, default: 0 },
        haltReason: { type: String, nullable: true },
        checkpoint: { type: 'jsonb', nullable: true },
        startedAt: { type: 'timestamp with time zone', nullable: true },
        endedAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_run_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_run_conversation', columns: ['conversationId'], unique: false },
        { name: 'idx_ba_run_status', columns: ['status'], unique: false },
    ],
    relations: {
        conversation: {
            type: 'many-to-one',
            target: 'browser_agent_conversation',
            onDelete: 'CASCADE',
            nullable: false,
            joinColumn: {
                name: 'conversationId',
                foreignKeyConstraintName: 'fk_ba_run_conversation',
            },
        },
    },
})

export const AgentActionEntity = new EntitySchema<AgentActionSchema>({
    name: 'browser_agent_action',
    columns: {
        ...BaseColumnSchemaPart,
        runId: { ...IbIdSchema, nullable: false },
        type: { type: String, nullable: false },
        targetRef: { type: String, nullable: true },
        args: { type: 'jsonb', nullable: true },
        class: { type: String, nullable: false },
        status: { type: String, nullable: false },
        approvedBy: { ...IbIdSchema, nullable: true },
        result: { type: 'jsonb', nullable: true },
    },
    indices: [
        { name: 'idx_ba_action_run', columns: ['runId'], unique: false },
        { name: 'idx_ba_action_status', columns: ['status'], unique: false },
    ],
    relations: {
        run: {
            type: 'many-to-one',
            target: 'browser_agent_run',
            onDelete: 'CASCADE',
            nullable: false,
            joinColumn: {
                name: 'runId',
                foreignKeyConstraintName: 'fk_ba_action_run',
            },
        },
    },
})
