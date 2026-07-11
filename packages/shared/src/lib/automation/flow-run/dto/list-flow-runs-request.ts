import { z } from 'zod'
import { OptionalArrayFromQuery, OptionalBooleanFromQuery } from '../../../core/common/base-model'
import { IbId } from '../../../core/common/id-generator'
import { FlowRunStatus } from '../execution/flow-execution'

export const ListFlowRunsRequestQuery = z.object({
    flowId: OptionalArrayFromQuery(IbId),
    tags: OptionalArrayFromQuery(z.string()),
    status: OptionalArrayFromQuery(z.nativeEnum(FlowRunStatus)),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    projectId: IbId,
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
    flowRunIds: OptionalArrayFromQuery(IbId),
    includeArchived: OptionalBooleanFromQuery,
})

export type ListFlowRunsRequestQuery = z.infer<typeof ListFlowRunsRequestQuery>

export const CountFlowRunsByStatusRequest = z.object({
    projectId: IbId,
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
})

export const FlowRunCountByStatus = z.object({
    status: z.nativeEnum(FlowRunStatus),
    count: z.number(),
})

export const CountFlowRunsByStatusResponse = z.object({
    data: z.array(FlowRunCountByStatus),
})

export type CountFlowRunsByStatusRequest = z.infer<typeof CountFlowRunsByStatusRequest>
export type FlowRunCountByStatus = z.infer<typeof FlowRunCountByStatus>
export type CountFlowRunsByStatusResponse = z.infer<typeof CountFlowRunsByStatusResponse>
