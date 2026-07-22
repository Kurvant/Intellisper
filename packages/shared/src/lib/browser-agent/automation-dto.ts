import { z } from 'zod'
import { Nullable } from '../core/common/base-model'
import { AgentBatchJob, AgentBatchJobStatus, AgentSchedule } from './automation'
import { RoutineRunStatus } from './routine'

/**
 * Automation (batch / schedule / presence / work) request-response DTOs. A batch runs one routine
 * across many parameter sets on the user's LIVE session (connected extension); a schedule re-fires a
 * routine on a cron; the work surface lets the extension claim the next unattended action.
 */

// ── Batch ─────────────────────────────────────────────────────────────────────────────────────────

/** Create a batch from structured rows (JSON). CSV/Excel upload is a separate multipart route. */
export const CreateBatchRequest = z.object({
    projectId: z.string(),
    routineId: z.string(),
    /** One object per row — { paramName → value }. Sanitised server-side. */
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(10000),
    concurrency: z.number().int().min(1).max(20).optional(),
    notify: Nullable(z.object({
        onDone: z.boolean().optional(),
        onFailed: z.boolean().optional(),
        onNeedsAttention: z.boolean().optional(),
        email: z.string().email().optional(),
    })).optional(),
})
export type CreateBatchRequest = z.infer<typeof CreateBatchRequest>

/** Project-scoped body with the routine to batch (the rows come from an uploaded file). */
export const UploadBatchRequest = z.object({
    projectId: z.string(),
    routineId: z.string(),
    concurrency: z.coerce.number().int().min(1).max(20).optional(),
})
export type UploadBatchRequest = z.infer<typeof UploadBatchRequest>

export const ListBatchesRequest = z.object({
    projectId: z.string(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListBatchesRequest = z.infer<typeof ListBatchesRequest>

export const BatchProjectRequest = z.object({
    projectId: z.string(),
})
export type BatchProjectRequest = z.infer<typeof BatchProjectRequest>

/** A per-row status view in a batch detail. */
export const BatchRowView = z.object({
    id: z.string(),
    rowIndex: Nullable(z.number()),
    status: z.enum([
        RoutineRunStatus.PENDING,
        RoutineRunStatus.RUNNING,
        RoutineRunStatus.PAUSED,
        RoutineRunStatus.COMPLETED,
        RoutineRunStatus.FAILED,
    ]),
    agentRunId: Nullable(z.string()),
})
export type BatchRowView = z.infer<typeof BatchRowView>

export const GetBatchResponse = z.object({
    batch: AgentBatchJob,
    rows: z.array(BatchRowView),
})
export type GetBatchResponse = z.infer<typeof GetBatchResponse>

export const ListBatchesResponse = z.object({
    batches: z.array(AgentBatchJob),
})
export type ListBatchesResponse = z.infer<typeof ListBatchesResponse>

export const BatchCreatedResponse = z.object({
    id: z.string(),
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
})
export type BatchCreatedResponse = z.infer<typeof BatchCreatedResponse>

// ── Schedule ────────────────────────────────────────────────────────────────────────────────────

export const CreateScheduleRequest = z.object({
    projectId: z.string(),
    routineId: z.string(),
    name: z.string().min(1).max(200),
    cron: z.string().min(1).max(120),
    timezone: z.string().max(64).optional(),
    paramSets: Nullable(z.array(z.record(z.string(), z.unknown()))).optional(),
    notify: Nullable(z.object({
        onDone: z.boolean().optional(),
        onFailed: z.boolean().optional(),
        onNeedsAttention: z.boolean().optional(),
        email: z.string().email().optional(),
    })).optional(),
})
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequest>

export const ListSchedulesRequest = z.object({
    projectId: z.string(),
})
export type ListSchedulesRequest = z.infer<typeof ListSchedulesRequest>

export const SetScheduleEnabledRequest = z.object({
    projectId: z.string(),
    enabled: z.boolean(),
})
export type SetScheduleEnabledRequest = z.infer<typeof SetScheduleEnabledRequest>

export const ScheduleProjectRequest = z.object({
    projectId: z.string(),
})
export type ScheduleProjectRequest = z.infer<typeof ScheduleProjectRequest>

export const ListSchedulesResponse = z.object({
    schedules: z.array(AgentSchedule),
})
export type ListSchedulesResponse = z.infer<typeof ListSchedulesResponse>

// ── Work / presence (extension) ─────────────────────────────────────────────────────────────────

export const WorkPresenceRequest = z.object({
    projectId: z.string(),
})
export type WorkPresenceRequest = z.infer<typeof WorkPresenceRequest>

/** The next unattended action for the extension to execute, or null when idle. */
export const ClaimedWork = z.object({
    runId: z.string(),
    actionId: z.string(),
    tool: z.string(),
    args: z.record(z.string(), z.unknown()),
    actionClass: z.string(),
})
export type ClaimedWork = z.infer<typeof ClaimedWork>

export const ClaimWorkResponse = z.object({
    work: Nullable(ClaimedWork),
})
export type ClaimWorkResponse = z.infer<typeof ClaimWorkResponse>
