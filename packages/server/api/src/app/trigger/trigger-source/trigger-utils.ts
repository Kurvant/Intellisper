import { TriggerBase } from '@intelblocks/blocks-framework'
import {
    IntellisperError,
    ErrorCode,
    FlowTriggerType,
    FlowVersion,
    isNil,
    ProjectId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { blockMetadataService } from '../../pieces/metadata/piece-metadata-service'
import { projectService } from '../../project/project-service'

export const triggerUtils = (log: FastifyBaseLogger) => ({
    async getBlockTriggerOrThrow({ flowVersion, projectId }: GetBlockTriggerOrThrowParams): Promise<TriggerBase> {

        const blockTrigger = await this.getBlockTrigger({
            flowVersion,
            projectId,

        })
        if (isNil(blockTrigger)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'piece_trigger',
                    entityId: flowVersion.trigger.settings.triggerName,
                    message: `Trigger not found for piece ${flowVersion.trigger.settings.blockName}@${flowVersion.trigger.settings.blockVersion}`,
                    extra: {
                        blockName: flowVersion.trigger.settings.blockName,
                        blockVersion: flowVersion.trigger.settings.blockVersion,
                        triggerName: flowVersion.trigger.settings.triggerName,
                    },
                },
            })
        }
        return blockTrigger
    },
    async getBlockTrigger({ flowVersion, projectId }: GetBlockTriggerOrThrowParams): Promise<TriggerBase | null> {
        if (flowVersion.trigger.type !== FlowTriggerType.BLOCK) {
            return null
        }
        const { blockName, blockVersion, triggerName } = flowVersion.trigger.settings
        if (isNil(triggerName)) {
            return null
        }
        return this.getBlockTriggerByName({
            blockName,
            blockVersion,
            triggerName,
            projectId,
        })
    },
    async getBlockTriggerByName({ blockName, blockVersion, triggerName, projectId }: GetBlockTriggerByNameParams): Promise<TriggerBase | null> {
        const platformId = await projectService(log).getPlatformId(projectId)
        const block = await blockMetadataService(log).get({
            platformId,
            name: blockName,
            version: blockVersion,
        })
        if (isNil(block) || isNil(triggerName)) {
            return null
        }
        const blockTrigger = block.triggers[triggerName]
        return blockTrigger
    },
})

type GetBlockTriggerByNameParams = {
    blockName: string
    blockVersion: string
    triggerName: string
    projectId: ProjectId
}

type GetBlockTriggerOrThrowParams = {
    flowVersion: FlowVersion
    projectId: ProjectId
}