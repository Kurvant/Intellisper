import { FlowActionType, flowStructureUtil, FlowTriggerType, FlowVersion } from '@intelblocks/shared'

export const flowMigrationUtil = {
    pinBlockToVersion(flowVersion: FlowVersion, blockName: string, blockVersion: string) {
        const newVersion = flowStructureUtil.transferFlow(flowVersion, (step) => {
            if ((step.type === FlowActionType.BLOCK || step.type === FlowTriggerType.BLOCK) && step.settings.blockName === blockName) {
                return {
                    ...step,
                    settings: {
                        ...step.settings,
                        blockVersion,
                    },
                }
            }
            return step
        })
        return newVersion
    },
}