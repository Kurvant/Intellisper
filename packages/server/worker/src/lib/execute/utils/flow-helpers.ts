import { FlowActionType, flowStructureUtil, FlowTriggerType, FlowVersion, BlockPackage, tryCatch, WorkerToApiContract } from '@intelblocks/shared'
import { Logger } from 'pino'
import { CodeArtifact } from '../../cache/code/code-builder'
import { blockCache, BlockNotFoundError } from '../../cache/pieces/piece-cache'
import { provisioner } from '../../cache/provisioner'

export async function provisionFlowBlocks(params: {
    flowVersion: FlowVersion
    platformId: string
    flowId: string
    projectId: string
    log: Logger
    apiClient: WorkerToApiContract
}): Promise<boolean> {
    const { flowVersion, platformId, flowId, projectId, log, apiClient } = params
    const { error } = await tryCatch(async () => {
        const blocks = await extractBlockPackages(flowVersion, platformId, log, apiClient)
        const codeSteps = extractCodeArtifacts(flowVersion)
        await provisioner(log, apiClient).provision({ blocks, codeSteps })
    })
    if (error) {
        if (!(error instanceof BlockNotFoundError)) {
            throw error
        }
        log.warn({ error: String(error), flowId }, 'Flow disabled due to missing piece')
        const { error: disableError } = await tryCatch(
            () => apiClient.disableFlow({ flowId, projectId }),
        )
        if (disableError) {
            log.error({ error: String(disableError), flowId }, 'Failed to disable flow after missing piece')
        }
        return false
    }
    return true
}

export async function extractBlockPackages(flowVersion: FlowVersion, platformId: string, log: Logger, apiClient: WorkerToApiContract): Promise<BlockPackage[]> {
    const blockSteps = flowStructureUtil.getAllSteps(flowVersion.trigger)
        .filter((step) => step.type === FlowActionType.BLOCK || step.type === FlowTriggerType.BLOCK)

    return Promise.all(
        blockSteps.map((step) =>
            blockCache(log, apiClient).getBlock({
                blockName: step.settings.blockName,
                blockVersion: step.settings.blockVersion,
                platformId,
            }),
        ),
    )
}

export function extractCodeArtifacts(flowVersion: FlowVersion): CodeArtifact[] {
    return flowStructureUtil.getAllSteps(flowVersion.trigger)
        .filter((step) => step.type === FlowActionType.CODE)
        .map((step) => ({
            name: step.name,
            sourceCode: step.settings.sourceCode,
            flowVersionId: flowVersion.id,
            flowVersionState: flowVersion.state,
        }))
}
