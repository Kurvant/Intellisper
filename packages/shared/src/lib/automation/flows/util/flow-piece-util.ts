import { FlowActionType } from '../actions/action'
import { FlowTrigger, FlowTriggerType } from '../triggers/trigger'
import { flowStructureUtil } from '../util/flow-structure-util'

export const flowBlockUtil = {
    getExactVersion(blockVersion: string): string {
        if (blockVersion.startsWith('^') || blockVersion.startsWith('~')) {
            return blockVersion.slice(1)
        }
        return blockVersion
    },
    getUsedBlocks(trigger: FlowTrigger): string[] {
        return flowStructureUtil.getAllSteps(trigger)
            .filter((step) => step.type === FlowActionType.BLOCK || step.type === FlowTriggerType.BLOCK)
            .map((step) => step.settings.blockName)
    },
}
