import { z } from 'zod'
import { IbId } from '../../core/common/id-generator'

export enum TriggerTestStrategy {
    SIMULATION = 'SIMULATION',
    TEST_FUNCTION = 'TEST_FUNCTION',
}

export const TestTriggerRequestBody = z.object({
    projectId: IbId,
    flowId: IbId,
    flowVersionId: IbId,
    testStrategy: z.nativeEnum(TriggerTestStrategy),
})

export type TestTriggerRequestBody = z.infer<typeof TestTriggerRequestBody>


export const CancelTestTriggerRequestBody = z.object({
    projectId: IbId,
    flowId: IbId,
})

export type CancelTestTriggerRequestBody = z.infer<typeof CancelTestTriggerRequestBody>
