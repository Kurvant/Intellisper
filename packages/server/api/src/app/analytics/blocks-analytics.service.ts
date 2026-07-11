import { FlowActionType, FlowStatus, flowStructureUtil, FlowTriggerType, isNil, BlockAction, BlockTrigger } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from     '../core/db/repo-factory'
import { FlowEntity } from '../flows/flow/flow.entity'
import { flowVersionService } from '../flows/flow-version/flow-version.service'
import { SystemJobName } from '../helper/system-jobs/common'
import { systemJobHandlers } from '../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { blockMetadataService } from '../pieces/metadata/piece-metadata-service'
import { projectService } from '../project/project-service'

const flowRepo = repoFactory(FlowEntity)

export const blocksAnalyticsService = (log: FastifyBaseLogger) => ({
    async init(): Promise<void> {
        systemJobHandlers.registerJobHandler(SystemJobName.BLOCKS_ANALYTICS, async () => {
            const flowIds: string[] = (await flowRepo().createQueryBuilder().select('id').where({
                status: FlowStatus.ENABLED,
            }).getRawMany()).map((flow) => flow.id)
            const activeProjects: Record<string, Set<string>> = {}
            log.info('Syncing pieces analytics')
            for (const flowId of flowIds) {
                const flow = await flowRepo().findOneBy({
                    id: flowId,
                })
                const publishedVersionId = flow?.publishedVersionId
                if (isNil(flow) || isNil(publishedVersionId)) {
                    continue
                }
                const flowVersion = await flowVersionService(log).getOne(publishedVersionId)
                if (isNil(flowVersion)) {
                    continue
                }
                const blocks = flowStructureUtil.getAllSteps(flowVersion.trigger).filter(
                    (step) =>
                        step.type === FlowActionType.BLOCK || step.type === FlowTriggerType.BLOCK,
                ).map((step) => {
                    const clonedStep = step as (BlockTrigger | BlockAction)
                    return {
                        name: clonedStep.settings.blockName,
                        version: clonedStep.settings.blockVersion,
                    }
                })
                const platformId = await projectService(log).getPlatformId(flow.projectId)

                for (const block of blocks) {
                    try {   
                        const blockMetadata = await blockMetadataService(log).getOrThrow({
                            name: block.name,
                            version: block.version,
                            platformId,
                        })
                        const blockId = blockMetadata.id!
                        activeProjects[blockId] = activeProjects[blockId] || new Set()
                        activeProjects[blockId].add(flow.projectId)
                    }
                    catch (e) {
                        log.error({
                            name: block.name,
                            version: block.version,
                        }, 'Block not found in pieces analytics service')
                    }
                }
            }
            for (const id in activeProjects) {
                await blockMetadataService(log).updateUsage({
                    id,
                    usage: activeProjects[id].size,
                })
            }
            log.info('Synced pieces analytics finished')
        })
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.BLOCKS_ANALYTICS,
                data: {},
                jobId: SystemJobName.BLOCKS_ANALYTICS,
            },
            schedule: {
                type: 'repeated',
                cron: '0 12 * * *',
            },
        })
    },
})