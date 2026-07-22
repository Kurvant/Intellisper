import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'

/**
 * A Routine is a saved, replayable browser task recorded from an agent run (renamed from the
 * source product's "workflow" to avoid colliding with blockunits Flows). Steps carry multi-signal
 * locators + an NL intent so replay can self-heal when a page changes.
 */
export const RoutineParamType = {
    TEXT: 'TEXT',
    EMAIL: 'EMAIL',
    NUMBER: 'NUMBER',
    DATE: 'DATE',
    URL: 'URL',
    TEL: 'TEL',
    SELECT: 'SELECT',
} as const
export type RoutineParamType = (typeof RoutineParamType)[keyof typeof RoutineParamType]

export const RoutineParam = z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum([
        RoutineParamType.TEXT,
        RoutineParamType.EMAIL,
        RoutineParamType.NUMBER,
        RoutineParamType.DATE,
        RoutineParamType.URL,
        RoutineParamType.TEL,
        RoutineParamType.SELECT,
    ]),
    required: z.boolean(),
    options: Nullable(z.array(z.string())),
    default: Nullable(z.string()),
})
export type RoutineParam = z.infer<typeof RoutineParam>

export const Routine = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    userId: z.string(),
    projectId: z.string(),
    name: z.string(),
    description: Nullable(z.string()),
    params: z.array(RoutineParam),
    version: z.number(),
    deletedAt: Nullable(z.string()),
})
export type Routine = z.infer<typeof Routine>

export const RoutineStep = z.object({
    ...BaseModelSchema,
    routineId: z.string(),
    ordinal: z.number(),
    action: z.string(),
    locators: z.record(z.string(), z.unknown()),
    intent: z.string(),
    config: Nullable(z.record(z.string(), z.unknown())),
})
export type RoutineStep = z.infer<typeof RoutineStep>

export const RoutineRunStatus = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
} as const
export type RoutineRunStatus = (typeof RoutineRunStatus)[keyof typeof RoutineRunStatus]

export const RoutineRun = z.object({
    ...BaseModelSchema,
    routineId: z.string(),
    platformId: z.string(),
    userId: z.string(),
    projectId: z.string(),
    batchJobId: Nullable(z.string()),
    rowIndex: Nullable(z.number()),
    paramValues: Nullable(z.record(z.string(), z.unknown())),
    agentRunId: Nullable(z.string()),
    status: z.enum([
        RoutineRunStatus.PENDING,
        RoutineRunStatus.RUNNING,
        RoutineRunStatus.PAUSED,
        RoutineRunStatus.COMPLETED,
        RoutineRunStatus.FAILED,
    ]),
    progress: Nullable(z.record(z.string(), z.unknown())),
    startedAt: Nullable(z.string()),
    endedAt: Nullable(z.string()),
})
export type RoutineRun = z.infer<typeof RoutineRun>
