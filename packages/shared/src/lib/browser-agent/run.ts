import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'

export const AgentRunStatus = {
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
    COMPLETED: 'COMPLETED',
    HALTED: 'HALTED',
    FAILED: 'FAILED',
} as const
export type AgentRunStatus = (typeof AgentRunStatus)[keyof typeof AgentRunStatus]

export const AgentActionClass = {
    SAFE: 'SAFE',
    REVERSIBLE: 'REVERSIBLE',
    CONSEQUENTIAL: 'CONSEQUENTIAL',
} as const
export type AgentActionClass = (typeof AgentActionClass)[keyof typeof AgentActionClass]

export const AgentActionStatus = {
    PROPOSED: 'PROPOSED',
    AWAITING_APPROVAL: 'AWAITING_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    EXECUTED: 'EXECUTED',
    FAILED: 'FAILED',
} as const
export type AgentActionStatus = (typeof AgentActionStatus)[keyof typeof AgentActionStatus]

export const AgentRun = z.object({
    ...BaseModelSchema,
    conversationId: z.string(),
    platformId: z.string(),
    userId: z.string(),
    projectId: z.string(),
    status: z.enum([
        AgentRunStatus.PENDING,
        AgentRunStatus.RUNNING,
        AgentRunStatus.AWAITING_CONFIRMATION,
        AgentRunStatus.COMPLETED,
        AgentRunStatus.HALTED,
        AgentRunStatus.FAILED,
    ]),
    stepCount: z.number(),
    /** Accumulated billed-token cost (stored as string — bigint column). */
    tokenCost: z.string(),
    haltReason: Nullable(z.string()),
    /** Resumable engine state (opaque JSONB); shape owned by the engine. */
    checkpoint: Nullable(z.record(z.string(), z.unknown())),
    startedAt: Nullable(z.string()),
    endedAt: Nullable(z.string()),
})
export type AgentRun = z.infer<typeof AgentRun>

export const AgentAction = z.object({
    ...BaseModelSchema,
    runId: z.string(),
    type: z.string(),
    targetRef: Nullable(z.string()),
    args: Nullable(z.record(z.string(), z.unknown())),
    class: z.enum([
        AgentActionClass.SAFE,
        AgentActionClass.REVERSIBLE,
        AgentActionClass.CONSEQUENTIAL,
    ]),
    status: z.enum([
        AgentActionStatus.PROPOSED,
        AgentActionStatus.AWAITING_APPROVAL,
        AgentActionStatus.APPROVED,
        AgentActionStatus.REJECTED,
        AgentActionStatus.EXECUTED,
        AgentActionStatus.FAILED,
    ]),
    approvedBy: Nullable(z.string()),
    result: Nullable(z.record(z.string(), z.unknown())),
})
export type AgentAction = z.infer<typeof AgentAction>
