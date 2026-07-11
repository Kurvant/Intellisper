// Clean-room implementation — concurrency capacity pools (capability spec G.1).
//
// A concurrency pool is a named capacity unit, scoped to a platform (organization)
// and identified by an operator-chosen key, that caps the number of simultaneous
// automation executions for the projects (workspaces) assigned to it. A project may
// be assigned to at most one pool; a project with no pool resolves to "no cap".
//
// Hot-path reads (a project's pool id, a pool's limit) are cached in the distributed
// store; the cache is refreshed on limit change. Absence is cached with an explicit
// sentinel so a "no pool" answer does not re-query the database every dispatch.


import { ibId, isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../../core/db/repo-factory'
import { getConcurrencyPoolLimitKey, getProjectConcurrencyPoolKey } from '../../../database/redis/keys'
import { distributedLock, distributedStore } from '../../../database/redis-connections'
import { projectRepo } from '../../../project/project-service'
import { ConcurrencyPoolEntity } from './concurrency-pool.entity'

const concurrencyPoolRepo = repoFactory(ConcurrencyPoolEntity)

// 24h cache. Pool membership and limits change rarely; a change explicitly refreshes
// or deletes the cached value, so a long TTL is safe and keeps the dispatch path off
// the database.
const CACHE_TTL_SECONDS = 24 * 60 * 60
// A project genuinely without a pool is cached as this sentinel so the absence is
// remembered (distinct from "not yet looked up"), avoiding a DB hit on every dispatch.
const NO_POOL_SENTINEL = 'none'
// A pool created without an explicit maximum imposes no practical cap.
const UNLIMITED_CONCURRENT_JOBS = 1_000_000

export const concurrencyPoolService = (log: FastifyBaseLogger) => ({
    // Create-or-update a pool for (platformId, key). Idempotent per that pair and
    // guarded so two concurrent first-creates cannot produce duplicate rows (the
    // unique index would otherwise reject the loser with an error). Returns the pool
    // id either way. Omitting maxConcurrentJobs leaves an existing limit unchanged.
    async upsertPool({ platformId, key, maxConcurrentJobs }: UpsertPoolParams): Promise<{ poolId: string }> {
        return distributedLock(log).runExclusive({
            key: `concurrency_pool_upsert:${platformId}:${key}`,
            timeoutInSeconds: 30,
            fn: async () => {
                const existing = await concurrencyPoolRepo().findOneBy({ platformId, key })
                if (!isNil(existing)) {
                    if (!isNil(maxConcurrentJobs)) {
                        await concurrencyPoolRepo().update({ id: existing.id }, { maxConcurrentJobs })
                        await distributedStore.put(getConcurrencyPoolLimitKey(existing.id), maxConcurrentJobs, CACHE_TTL_SECONDS)
                    }
                    return { poolId: existing.id }
                }

                const poolId = ibId()
                const limit = maxConcurrentJobs ?? UNLIMITED_CONCURRENT_JOBS
                await concurrencyPoolRepo().insert({
                    id: poolId,
                    platformId,
                    key,
                    maxConcurrentJobs: limit,
                })
                if (!isNil(maxConcurrentJobs)) {
                    await distributedStore.put(getConcurrencyPoolLimitKey(poolId), maxConcurrentJobs, CACHE_TTL_SECONDS)
                }
                return { poolId }
            },
        })
    },

    // Resolve which pool (if any) a project is assigned to. Cached with a sentinel for
    // the "no pool" case so the dispatch hot path never re-queries a poolless project.
    async getProjectPoolId(projectId: string): Promise<string | null> {
        const cached = await distributedStore.get<string>(getProjectConcurrencyPoolKey(projectId))
        if (!isNil(cached)) {
            return cached === NO_POOL_SENTINEL ? null : cached
        }

        const project = await projectRepo().findOne({
            where: { id: projectId },
            select: { poolId: true },
        })
        const poolId = project?.poolId ?? null
        await distributedStore.put(
            getProjectConcurrencyPoolKey(projectId),
            poolId ?? NO_POOL_SENTINEL,
            CACHE_TTL_SECONDS,
        )
        return poolId
    },

    // Assign (or clear) a project's pool. Refreshes the cached membership immediately
    // so the next dispatch sees the new assignment without waiting for TTL expiry.
    async assignProject({ projectId, poolId }: AssignProjectParams): Promise<void> {
        if (!isNil(poolId)) {
            await distributedStore.put(getProjectConcurrencyPoolKey(projectId), poolId, CACHE_TTL_SECONDS)
        }
        else {
            await distributedStore.delete(getProjectConcurrencyPoolKey(projectId))
        }
    },

    // A pool's maximum concurrency, cached. Returns null for an unknown pool id so the
    // caller can fall back to a plan-level default rather than blocking dispatch.
    async getPoolLimit(poolId: string): Promise<number | null> {
        const cached = await distributedStore.get<number>(getConcurrencyPoolLimitKey(poolId))
        if (!isNil(cached)) {
            return cached
        }

        const pool = await concurrencyPoolRepo().findOne({
            where: { id: poolId },
            select: { maxConcurrentJobs: true },
        })
        const limit = pool?.maxConcurrentJobs ?? null
        if (!isNil(limit)) {
            await distributedStore.put(getConcurrencyPoolLimitKey(poolId), limit, CACHE_TTL_SECONDS)
        }
        return limit
    },
})

type UpsertPoolParams = {
    platformId: string
    key: string
    maxConcurrentJobs?: number
}

type AssignProjectParams = {
    projectId: string
    poolId: string | null
}
