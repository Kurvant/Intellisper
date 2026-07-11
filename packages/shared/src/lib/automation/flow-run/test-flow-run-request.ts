import { z } from 'zod'
import { IbId } from '../../core/common/id-generator'
import { FlowRunStatus } from './execution/flow-execution'
import { FlowRetryStrategy } from './flow-run'

export const TestFlowRunRequestBody = z.object({
    flowVersionId: IbId,
})

export type TestFlowRunRequestBody = z.infer<typeof TestFlowRunRequestBody>

export const RetryFlowRequestBody = z.object({
    strategy: z.nativeEnum(FlowRetryStrategy),
    projectId: IbId,
})

export type RetryFlowRequestBody = z.infer<typeof RetryFlowRequestBody>


export const BulkActionOnRunsRequestBody = z.object({
    projectId: IbId,
    flowRunIds: z.array(IbId).optional(),
    excludeFlowRunIds: z.array(IbId).optional(),
    strategy: z.nativeEnum(FlowRetryStrategy),
    status: z.array(z.nativeEnum(FlowRunStatus)).optional(),
    flowId: z.array(IbId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
})

export type BulkActionOnRunsRequestBody = z.infer<typeof BulkActionOnRunsRequestBody>

export const BulkCancelFlowRequestBody = z.object({
    projectId: IbId,
    flowRunIds: z.array(IbId).optional(),
    excludeFlowRunIds: z.array(IbId).optional(),
    status: z.array(z.union([
        z.literal(FlowRunStatus.PAUSED),
        z.literal(FlowRunStatus.QUEUED),
    ])).optional(),
    flowId: z.array(IbId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
})

export type BulkCancelFlowRequestBody = z.infer<typeof BulkCancelFlowRequestBody>

export const BulkArchiveActionOnRunsRequestBody = z.object({
    projectId: IbId,
    flowRunIds: z.array(IbId).optional(),
    excludeFlowRunIds: z.array(IbId).optional(),
    status: z.array(z.nativeEnum(FlowRunStatus)).optional(),
    flowId: z.array(IbId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
})

export type BulkArchiveActionOnRunsRequestBody = z.infer<typeof BulkArchiveActionOnRunsRequestBody>
