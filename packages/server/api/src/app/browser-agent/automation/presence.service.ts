import { FastifyBaseLogger } from 'fastify'
import { distributedStore, redisConnections } from '../../database/redis-connections'

/**
 * Tracks whether a user's extension is CONNECTED (online and able to run browser actions on their
 * live session) and bounds how many automation rows run in parallel per user.
 *
 * Presence + the in-flight counter live in Redis via blockunits' `distributedStore` (a TTL key +
 * an integer counter), so they're correct across multiple API instances and restarts — no in-memory
 * session state, no sticky routing. `isConnected` is a single GET.
 *
 * The "work available" NUDGE is delivered by the presence GATEWAY over `app.io` (a userId room);
 * this service is purely the Redis-backed presence/concurrency state. Keeping the two separate means
 * the batch service/processor depend only on this (no socket coupling) and the push is best-effort.
 */

/** How long a heartbeat keeps a user marked "connected" (seconds). */
const PRESENCE_TTL_SECONDS = 90
/** Safety expiry so a crashed row can't leak the in-flight counter forever (seconds). */
const INFLIGHT_TTL_SECONDS = 3600

function presenceKey(userId: string): string {
    return `ba:automation:presence:${userId}`
}
function inflightKey(userId: string): string {
    return `ba:automation:inflight:${userId}`
}

export const browserAgentPresence = (log: FastifyBaseLogger) => ({
    /** Refresh a user's presence (called on socket connect + periodic heartbeat + on work claim). */
    async heartbeat(userId: string): Promise<void> {
        await distributedStore.put(presenceKey(userId), Date.now(), PRESENCE_TTL_SECONDS)
    },

    /** Mark a user offline immediately (socket disconnect). */
    async clear(userId: string): Promise<void> {
        await distributedStore.delete([presenceKey(userId)])
    },

    /** Whether the user's extension is currently connected (presence key still alive). */
    async isConnected(userId: string): Promise<boolean> {
        const v = await distributedStore.get<number>(presenceKey(userId))
        return v !== null && v !== undefined
    },

    // ── Per-user in-flight concurrency counter (bounds parallel rows) ────────────────────────────
    // Uses raw ioredis INCR/DECR (via the shared connection) for ATOMICITY: the admission processor
    // may run on multiple instances, so a read-modify-write would race and over-admit. A safety TTL
    // guards against a crashed row leaking the counter forever.

    /** Take an in-flight slot atomically; returns the new count. */
    async incrInflight(userId: string): Promise<number> {
        const redis = await redisConnections.useExisting()
        const n = await redis.incr(inflightKey(userId))
        await redis.expire(inflightKey(userId), INFLIGHT_TTL_SECONDS)
        return n
    },

    /** Release an in-flight slot atomically (clamped so it never goes below 0). */
    async decrInflight(userId: string): Promise<void> {
        const redis = await redisConnections.useExisting()
        const n = await redis.decr(inflightKey(userId))
        if (n < 0) await redis.set(inflightKey(userId), '0')
    },

    /** Current in-flight row count for a user. */
    async getInflight(userId: string): Promise<number> {
        const redis = await redisConnections.useExisting()
        const v = await redis.get(inflightKey(userId))
        return v ? Number.parseInt(v, 10) : 0
    },
})
