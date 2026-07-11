import {
    FlowActionType,
    flowBlockUtil,
    flowStructureUtil,
    FlowTriggerType,
    FlowVersion,
    isNil,
} from '@intelblocks/shared'
import { system } from '../../../helper/system/system'
import { blockMetadataService } from '../../../pieces/metadata/piece-metadata-service'
import { projectService } from '../../../project/project-service'
import { flowService } from '../../flow/flow.service'
import { Migration } from '.'

export const migrateV19StripBlockVersionWildcards: Migration = {
    targetSchemaVersion: '19',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const log = system.globalLogger()
        const flow = await flowService(log).getOneById(flowVersion.flowId)
        const platformId = isNil(flow)
            ? undefined
            : await projectService(log).getPlatformId(flow.projectId)

        const stepNameToExactVersion: Record<string, string> = {}
        const steps = flowStructureUtil.getAllSteps(flowVersion.trigger)

        for (const step of steps) {
            if (step.type !== FlowActionType.BLOCK && step.type !== FlowTriggerType.BLOCK) {
                continue
            }
            const version: string = step.settings.blockVersion
            if (!version.startsWith('~') && !version.startsWith('^')) {
                continue
            }
            const blockMetadata = await blockMetadataService(log).get({
                platformId,
                name: step.settings.blockName,
                version,
            })
            stepNameToExactVersion[step.name] = isNil(blockMetadata)
                ? flowBlockUtil.getExactVersion(version)
                : blockMetadata.version
        }

        const newFlowVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            const exactVersion = stepNameToExactVersion[step.name]
            if (isNil(exactVersion)) {
                return step
            }
            return {
                ...step,
                settings: {
                    ...step.settings,
                    blockVersion: exactVersion,
                },
            }
        })

        return {
            ...newFlowVersion,
            schemaVersion: '20',
        }
    },
}
