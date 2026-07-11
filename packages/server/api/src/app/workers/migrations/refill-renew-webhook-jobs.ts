import { WebhookRenewStrategy } from '@intelblocks/blocks-framework'
import { isNil, LATEST_JOB_DATA_SCHEMA_VERSION, TriggerSourceScheduleType, TriggerStrategy, WorkerJobType } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { blockMetadataService } from '../../pieces/metadata/piece-metadata-service'
import { projectService } from '../../project/project-service'
import { triggerSourceRepo } from '../../trigger/trigger-source/trigger-source-service'
import { jobQueue, JobType } from '../job-queue/job-queue'

export const refillRenewWebhookJobs = (log: FastifyBaseLogger) => ({
    async run(): Promise<void> {
        const triggerSources = await triggerSourceRepo().find({
            where: {
                deleted: IsNull(),
                simulate: false,
                type: TriggerStrategy.WEBHOOK,
            },
        })
        let migratedRenewWebhookJobs = 0

        const batchSize = 100
        for (let i = 0; i < triggerSources.length; i += batchSize) {
            const batch = triggerSources.slice(i, i + batchSize)
            await Promise.all(batch.map(async (triggerSource) => {
                const blockMetadata = await blockMetadataService(log).get({
                    name: triggerSource.blockName,
                    version: triggerSource.blockVersion,
                    platformId: await projectService(log).getPlatformId(triggerSource.projectId),
                })
                const blockTrigger = blockMetadata?.triggers?.[triggerSource.triggerName]
                if (isNil(blockTrigger) || isNil(blockTrigger.renewConfiguration) || blockTrigger.renewConfiguration.strategy !== WebhookRenewStrategy.CRON) {
                    return
                }
                await jobQueue(log).add({
                    id: triggerSource.flowVersionId,
                    type: JobType.REPEATING,
                    data: {
                        projectId: triggerSource.projectId,
                        platformId: await projectService(log).getPlatformId(triggerSource.projectId),
                        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                        flowVersionId: triggerSource.flowVersionId,
                        flowId: triggerSource.flowId,
                        jobType: WorkerJobType.RENEW_WEBHOOK,
                    },
                    scheduleOptions: {
                        type: TriggerSourceScheduleType.CRON_EXPRESSION,
                        cronExpression: blockTrigger.renewConfiguration.cronExpression,
                        timezone: 'UTC',
                    },
                })
                migratedRenewWebhookJobs++
            }))
        }

        log.info({
            migratedRenewWebhookJobs,
        }, '[renewWebhookJobsMigration] Migrated renew webhook jobs')
    },
})