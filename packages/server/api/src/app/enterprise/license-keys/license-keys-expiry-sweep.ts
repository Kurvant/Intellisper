// Clean-room implementation — license-key expiry sweep (capability spec G.4.a). A named scheduled
// system job (`license-key-expiry-sweep`, daily cron) that periodically re-verifies every
// organization's license entitlements: it iterates all organizations, skips any whose plan has no
// license key, and for each licensed one runs the compose-verify. If the key is now missing or
// expired the organization is downgraded to the free tier; if valid, its limits are re-applied
// (self-healing if an entitlement drifted). Each organization is processed in its own try/catch so
// one bad key never aborts the sweep.
import { isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { SystemJobName } from '../../helper/system-jobs/common'
import { systemJobHandlers } from '../../helper/system-jobs/job-handlers'
import { systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { PlatformPlanEntity } from '../platform/platform-plan/platform-plan.entity'
import { licenseKeysService } from './license-keys-service'

const platformPlanRepo = repoFactory(PlatformPlanEntity)

// Once per day.
const SWEEP_CRON = '0 4 * * *'

let sweepRegistered = false

export const licenseKeysExpirySweep = (log: FastifyBaseLogger) => ({
    // Register the sweep handler and upsert the daily schedule (idempotent per process).
    async init(): Promise<void> {
        if (!sweepRegistered) {
            sweepRegistered = true
            systemJobHandlers.registerJobHandler(SystemJobName.LICENSE_KEY_EXPIRY_SWEEP, async () => {
                await licenseKeysExpirySweep(log).run()
            })
        }
        await systemJobsSchedule(log).upsertJob({
            job: {
                name: SystemJobName.LICENSE_KEY_EXPIRY_SWEEP,
                data: {},
                jobId: SystemJobName.LICENSE_KEY_EXPIRY_SWEEP,
            },
            schedule: {
                type: 'repeated',
                cron: SWEEP_CRON,
            },
        })
    },

    // Re-verify every licensed organization; downgrade the expired/removed, re-apply the valid.
    async run(): Promise<void> {
        const licensedPlans = await platformPlanRepo()
            .createQueryBuilder('plan')
            .select(['plan.platformId AS "platformId"', 'plan.licenseKey AS "licenseKey"'])
            .where('plan.licenseKey IS NOT NULL')
            .getRawMany<{ platformId: string, licenseKey: string }>()

        const service = licenseKeysService(log)
        for (const plan of licensedPlans) {
            if (isNil(plan.licenseKey) || plan.licenseKey.trim() === '') {
                continue
            }
            try {
                const verified = await service.verifyKeyOrReturnNull({
                    platformId: plan.platformId,
                    license: plan.licenseKey,
                })
                if (isNil(verified)) {
                    await service.downgradeToFreePlan(plan.platformId)
                }
                else {
                    await service.applyLimits(plan.platformId, verified)
                }
            }
            catch (error) {
                log.error({ error, platformId: plan.platformId }, '[licenseKeysExpirySweep] failed to re-verify a licensed organization; continuing')
            }
        }
    },
})
