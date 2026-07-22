import { AgentBatchJob, AgentSchedule } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../../database/database-common'

/** The schedule row also stores the BullMQ job-scheduler key (server-internal; not in the DTO). */
type AgentScheduleRow = AgentSchedule & { repeatJobKey: string | null }

export const AgentBatchJobEntity = new EntitySchema<AgentBatchJob>({
    name: 'browser_agent_batch_job',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        projectId: { ...IbIdSchema, nullable: false },
        routineId: { ...IbIdSchema, nullable: false },
        scheduleId: { ...IbIdSchema, nullable: true },
        status: { type: String, nullable: false },
        rowsTotal: { type: Number, nullable: false, default: 0 },
        rowsCompleted: { type: Number, nullable: false, default: 0 },
        rowsFailed: { type: Number, nullable: false, default: 0 },
        concurrency: { type: Number, nullable: false, default: 1 },
        paramSets: { type: 'jsonb', nullable: true },
        notify: { type: 'jsonb', nullable: true },
        startedAt: { type: 'timestamp with time zone', nullable: true },
        endedAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_batch_platform_user', columns: ['platformId', 'userId'], unique: false },
        { name: 'idx_ba_batch_status', columns: ['status'], unique: false },
    ],
})

export const AgentScheduleEntity = new EntitySchema<AgentScheduleRow>({
    name: 'browser_agent_schedule',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: { ...IbIdSchema, nullable: false },
        userId: { ...IbIdSchema, nullable: false },
        projectId: { ...IbIdSchema, nullable: false },
        routineId: { ...IbIdSchema, nullable: false },
        name: { type: String, nullable: false },
        cron: { type: String, nullable: false },
        timezone: { type: String, nullable: false },
        paramSets: { type: 'jsonb', nullable: true },
        notify: { type: 'jsonb', nullable: true },
        enabled: { type: Boolean, nullable: false, default: true },
        repeatJobKey: { type: String, nullable: true },
        lastRunAt: { type: 'timestamp with time zone', nullable: true },
        nextRunAt: { type: 'timestamp with time zone', nullable: true },
    },
    indices: [
        { name: 'idx_ba_schedule_platform_user', columns: ['platformId', 'userId'], unique: false },
    ],
})
