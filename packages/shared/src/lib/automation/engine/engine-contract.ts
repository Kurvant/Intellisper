import { ReportAiUsageBatchRequest } from '../../ai-gateway/ai-usage'
import { EngineOperation, EngineOperationType, EngineResponse, EngineStderr, EngineStdout } from './engine-operation'
import { SendFlowResponseRequest, UpdateRunProgressRequest, UpdateStepProgressRequest, UploadRunLogsRequest } from './requests'

export type EngineContract = {
    executeOperation(input: { operationType: EngineOperationType, operation: EngineOperation }): Promise<EngineResponse<unknown>>
}

export type WorkerContract = {
    updateRunProgress(input: UpdateRunProgressRequest): Promise<void>
    uploadRunLog(input: UploadRunLogsRequest): Promise<void>
    sendFlowResponse(input: SendFlowResponseRequest): Promise<void>
    updateStepProgress(input: UpdateStepProgressRequest): Promise<void>
    /**
     * AI Gateway — AI spend incurred by AI blocks running INSIDE the engine sandbox.
     *
     * The engine has no direct write path to the API (its HTTP surface is read-only by design), so this
     * rides the existing engine→worker loopback RPC, and the worker relays it to the API's
     * `reportAiUsage`. Batched: the engine buffers and flushes, so a flow with many AI steps costs one
     * round-trip, not one per step.
     */
    reportAiUsage(input: ReportAiUsageBatchRequest): Promise<void>
}

export type WorkerNotifyContract = {
    stdout(input: EngineStdout): void
    stderr(input: EngineStderr): void
}
