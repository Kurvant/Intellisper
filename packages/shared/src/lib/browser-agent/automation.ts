import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'

export const AgentBatchJobStatus = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    PAUSED_WAITING_EXTENSION: 'PAUSED_WAITING_EXTENSION',
    COMPLETED: 'COMPLETED',
    COMPLETED_WITH_ERRORS: 'COMPLETED_WITH_ERRORS',
    CANCELED: 'CANCELED',
    FAILED: 'FAILED',
} as const
export type AgentBatchJobStatus =
    (typeof AgentBatchJobStatus)[keyof typeof AgentBatchJobStatus]

export const AgentBatchJob = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    userId: z.string(),
    projectId: z.string(),
    routineId: z.string(),
    /** The schedule that spawned this batch, when it was fired by a cron schedule (else null). */
    scheduleId: Nullable(z.string()),
    status: z.enum([
        AgentBatchJobStatus.PENDING,
        AgentBatchJobStatus.RUNNING,
        AgentBatchJobStatus.PAUSED_WAITING_EXTENSION,
        AgentBatchJobStatus.COMPLETED,
        AgentBatchJobStatus.COMPLETED_WITH_ERRORS,
        AgentBatchJobStatus.CANCELED,
        AgentBatchJobStatus.FAILED,
    ]),
    rowsTotal: z.number(),
    rowsCompleted: z.number(),
    rowsFailed: z.number(),
    concurrency: z.number(),
    /** The sanitised parameter sets, one per row (kept for retry/export). */
    paramSets: Nullable(z.array(z.record(z.string(), z.unknown()))),
    notify: Nullable(z.record(z.string(), z.unknown())),
    startedAt: Nullable(z.string()),
    endedAt: Nullable(z.string()),
})
export type AgentBatchJob = z.infer<typeof AgentBatchJob>

export const AgentSchedule = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    userId: z.string(),
    projectId: z.string(),
    routineId: z.string(),
    name: z.string(),
    cron: z.string(),
    timezone: z.string(),
    paramSets: Nullable(z.array(z.record(z.string(), z.unknown()))),
    notify: Nullable(z.record(z.string(), z.unknown())),
    enabled: z.boolean(),
    lastRunAt: Nullable(z.string()),
    nextRunAt: Nullable(z.string()),
})
export type AgentSchedule = z.infer<typeof AgentSchedule>
