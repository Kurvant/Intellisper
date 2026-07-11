import {
    EngineOperationType,
    ExecuteExtractBlockMetadataJobData,
    WorkerJobType,
} from '@intelblocks/shared'
import { provisioner } from '../../cache/provisioner'
import { workerSettings } from '../../config/worker-settings'
import { JobContext, JobHandler, JobResultKind, SynchronousJobResult } from '../types'

export const extractBlockInfoJob: JobHandler<ExecuteExtractBlockMetadataJobData, SynchronousJobResult> = {
    jobType: WorkerJobType.EXECUTE_EXTRACT_BLOCK_INFORMATION,
    async execute(ctx: JobContext, data: ExecuteExtractBlockMetadataJobData): Promise<SynchronousJobResult> {
        const timeoutInSeconds = workerSettings.getSettings().TRIGGER_TIMEOUT_SECONDS

        await provisioner(ctx.log, ctx.apiClient).provision({
            blocks: [data.block],
            codeSteps: [],
        })

        const sandbox = ctx.sandboxManager.acquire({ log: ctx.log, apiClient: ctx.apiClient })
        try {
            await sandbox.start({
                flowVersionId: undefined,
                platformId: data.platformId,
                mounts: [],
            })

            const result = await sandbox.execute(
                EngineOperationType.EXTRACT_BLOCK_METADATA,
                {
                    ...data.block,
                    platformId: data.platformId,
                    timeoutInSeconds,
                },
                { timeoutInSeconds },
            )

            return {
                kind: JobResultKind.SYNCHRONOUS,
                status: result.status,
                response: result.response,
                errorMessage: result.error,
                logs: result.logs,
            }
        }
        catch (e) {
            await ctx.sandboxManager.invalidate(ctx.log)
            throw e
        }
        finally {
            await ctx.sandboxManager.release(ctx.log)
        }
    },
}
