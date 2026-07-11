// Clean-room implementation — chat metrics retention prune (capability spec H.2.m).
//
// A daily system job that deletes chat_message_metric rows older than the configured retention
// window (CHAT_METRICS_RETENTION_DAYS, default 90) so the local analytics table stays bounded.
// init() registers the handler + upserts the daily schedule (idempotent, stable job id) and is
// called unconditionally at app boot; the routine is best-effort (errors logged, never thrown).
import { ibDayjsDuration } from '@intelblocks/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { LessThan } from 'typeorm'
import { repoFactory } from '../../../core/db/repo-factory'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { SystemJobName } from '../../../helper/system-jobs/common'
import { systemJobHandlers } from '../../../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../../../helper/system-jobs/system-job'
import { ChatMessageMetricEntity } from './chat-message-metric.entity'

const metricRepo = repoFactory(ChatMessageMetricEntity)

const PRUNE_CRON = '0 4 * * *' // daily, 04:00
const DEFAULT_RETENTION_DAYS = 90

let handlerRegistered = false

function retentionDays(): number {
    const configured = system.getNumber(AppSystemProp.CHAT_METRICS_RETENTION_DAYS)
    return configured === null || configured <= 0 ? DEFAULT_RETENTION_DAYS : configured
}

export const chatMetricsPrune = (log: FastifyBaseLogger) => ({
    async init(): Promise<void> {
        if (!handlerRegistered) {
            handlerRegistered = true
            systemJobHandlers.registerJobHandler(SystemJobName.CHAT_METRICS_PRUNE, async () => {
                await chatMetricsPrune(log).run()
            })
        }
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.CHAT_METRICS_PRUNE,
                data: {},
                jobId: SystemJobName.CHAT_METRICS_PRUNE,
            },
            schedule: {
                type: 'repeated',
                cron: PRUNE_CRON,
            },
        })
    },

    // Delete metric rows older than the retention window. Best-effort.
    async run(): Promise<void> {
        try {
            const days = retentionDays()
            const boundary = new Date(Date.now() - ibDayjsDuration(days, 'day').asMilliseconds()).toISOString()
            const result = await metricRepo().delete({ created: LessThan(boundary) })
            log.info({ deleted: result.affected ?? 0, retentionDays: days }, '[chatMetricsPrune] pruned old chat metrics')
        }
        catch (error) {
            log.error({ error }, '[chatMetricsPrune] prune run failed')
        }
    },
})
