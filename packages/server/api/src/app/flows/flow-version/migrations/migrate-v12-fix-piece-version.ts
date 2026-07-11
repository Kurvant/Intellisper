import {
    FlowActionType,
    flowStructureUtil,
    FlowTriggerType,
    FlowVersion,
    FlowVersionState,
    isNil,
    tryCatch,
} from '@intelblocks/shared'
import { system } from '../../../helper/system/system'
import { blockMetadataService } from '../../../pieces/metadata/piece-metadata-service'
import { projectService } from '../../../project/project-service'
import { flowService } from '../../flow/flow.service'
import { Migration } from '.'

export const migrateV12FixBlockVersion: Migration = {
    targetSchemaVersion: '12',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        if (flowVersion.state !== FlowVersionState.LOCKED) {
            return {
                ...flowVersion,
                schemaVersion: '13',
            }
        }

        const flow = await flowService(system.globalLogger()).getOneById(flowVersion.flowId)
        if (isNil(flow)) {
            return {
                ...flowVersion,
                schemaVersion: '13',
            }
        }
        const platformId = await projectService(system.globalLogger()).getPlatformId(flow.projectId)
        const stepNameToBlockVersion: Record<string, string> = {}
        const steps = flowStructureUtil.getAllSteps(flowVersion.trigger)
        for (const step of steps) {
            if (step.type === FlowActionType.BLOCK || step.type === FlowTriggerType.BLOCK) {
                const { data: blockMetadata } = await tryCatch(async () => blockMetadataService(system.globalLogger()).getOrThrow({
                    platformId,
                    name: step.settings.blockName,
                    version: step.settings.blockVersion,
                }),
                )
                if (!isNil(blockMetadata)) {
                    stepNameToBlockVersion[step.name] = blockMetadata.version
                }
            }
        }
        const newFlowVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if (stepNameToBlockVersion[step.name]) {
                return {
                    ...step,
                    settings: {
                        ...step.settings,
                        blockVersion: stepNameToBlockVersion[step.name],
                    },
                }
            }
            return step
        })
        return {
            ...newFlowVersion,
            schemaVersion: '13',
        }
    },
}

