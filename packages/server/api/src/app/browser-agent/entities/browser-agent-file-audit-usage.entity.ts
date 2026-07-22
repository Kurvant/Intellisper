import { AgentAuditLog, AgentFile, AgentUsageCounter } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

export const AgentFileEntity = new EntitySchema<AgentFile>({
    name: 'browser_agent_file',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        conversationId: { ...IbIdSchema, nullable: true },
        name: { type: String, nullable: false },
        mime: { type: String, nullable: false },
        sizeBytes: { type: Number, nullable: false },
        contentHash: { type: String, nullable: false },
        s3Key: { type: String, nullable: false },
        version: { type: Number, nullable: false, default: 1 },
        deletedAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_file_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_file_user_hash', columns: ['userId', 'contentHash'], unique: false },
    ],
})

export const AgentAuditLogEntity = new EntitySchema<AgentAuditLog>({
    name: 'browser_agent_audit_log',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        runId: { ...IbIdSchema, nullable: true },
        event: { type: String, nullable: false },
        detail: { type: 'jsonb', nullable: true },
    },
    indices: [
        { name: 'idx_ba_audit_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_audit_run', columns: ['runId'], unique: false },
    ],
})

/**
 * Monthly usage counter — caps are POOLED PER PLATFORM, so the counter subject is the platformId.
 * A UNIQUE (platformId, period, metric) index backs the atomic `INSERT … ON CONFLICT` meter.
 */
export const AgentUsageCounterEntity = new EntitySchema<AgentUsageCounter>({
    name: 'browser_agent_usage_counter',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        period: { type: String, nullable: false },
        metric: { type: String, nullable: false },
        count: { type: Number, nullable: false, default: 0 },
    },
    indices: [
        { name: 'uq_ba_usage_platform_period_metric', columns: ['platformId', 'period', 'metric'], unique: true },
    ],
})
