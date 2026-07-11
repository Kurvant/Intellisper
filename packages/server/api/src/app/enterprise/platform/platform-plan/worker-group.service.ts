// Clean-room implementation — dedicated execution capacity ("worker groups")
// (capability spec G.2).
//
// An organization may be directed to a named execution group instead of the shared
// pool. The assignment lives on the organization's plan record (workerGroupId). A
// distinguished value ("canary") routes the organization's requests to the canary
// deployment.
//
// Design note: the canary decision is on a very hot path (every proxied request), so
// rather than reading one organization's group per request, the set of currently-canary
// organizations is resolved once and cached as a whole; membership is then an in-memory
// lookup. A single-flight guard collapses concurrent first-reads into one database query.
// A group reassignment invalidates the relevant caches so the next read reflects it.
import { ibDayjsDuration } from '@intelblocks/server-utils'
import { isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../../../database/redis-connections'
import { getWorkerGroupQueueName, QueueName } from '../../../workers/job'
import { platformQueueMigrationService } from '../../../workers/platform-queue-migration.service'
import { platformPlanRepo } from './platform-plan.service'

// The distinguished group value that routes an organization to the canary deployment.
export const CANARY_WORKER_GROUP_ID = 'canary'

// Absence of a group is remembered with an explicit sentinel so a "shared pool" answer
// does not re-query the plan record on every request.
const NO_WORKER_GROUP_SENTINEL = '__none__'
// Short TTL: routing must react quickly to a change; a change also clears the cache and
// the TTL bounds any residual staleness.
const CACHE_TTL_SECONDS = ibDayjsDuration(5, 'minute').asSeconds()

const workerGroupCacheKey = (platformId: string): string => `platform:${platformId}:worker_group_id:v2`

// Resolved canary-set cache (persists until invalidated) plus a single-flight promise
// so a burst of concurrent first-reads collapses into one database query.
let canarySetCache: Set<string> | undefined
let inFlightCanarySet: Promise<Set<string>> | undefined

export const workerGroupService = (log: FastifyBaseLogger) => ({

    // The execution group an organization is assigned to, or null for the shared pool.
    // Cached per-organization with a short TTL and an explicit no-group sentinel.
    async getWorkerGroupId({ platformId }: { platformId: string }): Promise<string | null> {
        const cached = await distributedStore.get<string>(workerGroupCacheKey(platformId))
        if (!isNil(cached)) {
            return cached === NO_WORKER_GROUP_SENTINEL ? null : cached
        }

        const plan = await platformPlanRepo().findOne({
            select: ['workerGroupId'],
            where: { platformId },
        })
        const groupId = plan?.workerGroupId ?? null
        await distributedStore.put(workerGroupCacheKey(platformId), groupId ?? NO_WORKER_GROUP_SENTINEL, CACHE_TTL_SECONDS)
        return groupId
    },

    // Whether the organization is routed to the canary deployment. Resolved against a
    // cached set of all canary organizations so the hot path avoids a per-request query.
    async isCanaryPlatform({ platformId }: { platformId: string }): Promise<boolean> {
        const canarySet = await resolveCanarySet()
        return canarySet.has(platformId)
    },

    // Assign (or clear) an organization's execution group. Migrates already-queued work
    // to the target queue first so nothing is stranded, persists the change, then clears
    // the affected caches so the next read reflects it.
    async updateWorkerGroup({ platformId, workerGroupId }: UpdateWorkerGroupParams): Promise<void> {
        await this.moveJobsToTargetQueue({ platformId, workerGroupId })
        await platformPlanRepo().update({ platformId }, { workerGroupId })
        await invalidateCaches(platformId)
    },

    // Clear canary routing for every organization currently on the canary group (used
    // when winding down a progressive rollout). Invalidates the shared canary set.
    async disableAllCanary(): Promise<void> {
        const canaryPlatforms = await findCanaryPlatformIds()
        for (const platformId of canaryPlatforms) {
            await platformPlanRepo().update({ platformId }, { workerGroupId: null })
            await distributedStore.delete(workerGroupCacheKey(platformId))
        }
        clearCanarySetCache()
    },

    // Move an organization's already-queued jobs from its current group's queue to the
    // target group's queue (shared default when the target is null).
    async moveJobsToTargetQueue({ platformId, workerGroupId }: UpdateWorkerGroupParams): Promise<void> {
        const currentGroupId = await this.getWorkerGroupId({ platformId })
        const fromQueueName = isNil(currentGroupId) ? QueueName.WORKER_JOBS : getWorkerGroupQueueName(currentGroupId)
        const toQueueName = isNil(workerGroupId) ? QueueName.WORKER_JOBS : getWorkerGroupQueueName(workerGroupId)
        await platformQueueMigrationService(log).migrateJobs({ fromQueueName, toQueueName, platformId })
    },
})

// Resolve the set of canary organization ids. Returns the resolved cache if present;
// otherwise reads once, sharing a single in-flight query across concurrent callers, and
// retains the result until the cache is invalidated by a group change.
async function resolveCanarySet(): Promise<Set<string>> {
    if (!isNil(canarySetCache)) {
        return canarySetCache
    }
    if (isNil(inFlightCanarySet)) {
        inFlightCanarySet = (async () => {
            const ids = await findCanaryPlatformIds()
            const set = new Set(ids)
            canarySetCache = set
            return set
        })()
    }
    try {
        return await inFlightCanarySet
    }
    finally {
        inFlightCanarySet = undefined
    }
}

function clearCanarySetCache(): void {
    canarySetCache = undefined
    inFlightCanarySet = undefined
}

async function findCanaryPlatformIds(): Promise<string[]> {
    const rows = await platformPlanRepo().find({
        select: ['platformId'],
        where: { workerGroupId: CANARY_WORKER_GROUP_ID },
    })
    return rows.map((row) => row.platformId)
}

async function invalidateCaches(platformId: string): Promise<void> {
    await distributedStore.delete(workerGroupCacheKey(platformId))
    clearCanarySetCache()
}

type UpdateWorkerGroupParams = {
    platformId: string
    workerGroupId: string | null
}
