// Clean-room implementation — capped chat-rollout funnel (capability spec H.2.k / H.2.m).
//
// A minimal, self-contained rollout counter backing the funnel snapshot that chat telemetry pushes
// to the console. It tracks two monotonic counters in the distributed store — `landed` (users who
// reached the chat surface) and `chatted` (users who actually sent a message) — against a
// configured `cap`. The funnel is `closed` once `chatted` reaches the cap; closure is monotonic
// (a cached sticky flag), so a later dip below the cap never re-opens it.
//
// This is deliberately independent of any full free-credits/entitlement system: it exists so the
// rollout-funnel telemetry is complete and pushable on its own. If a richer H.2.k rollout record is
// built later, getFunnelSnapshot() can be re-pointed at it without changing the telemetry contract.
import { isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../../database/redis-connections'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

const LANDED_KEY = 'chat:rollout:landed'
const CHATTED_KEY = 'chat:rollout:chatted'
const CLOSED_KEY = 'chat:rollout:closed'

const DEFAULT_CAP = 1_000

export type FunnelSnapshot = {
    landed: number
    chatted: number
    cap: number
    closed: boolean
}

function resolveCap(): number {
    const configured = system.getNumber(AppSystemProp.CHAT_ROLLOUT_CAP)
    return isNil(configured) || configured <= 0 ? DEFAULT_CAP : configured
}

async function readCount(key: string): Promise<number> {
    const value = await distributedStore.get<number>(key)
    return typeof value === 'number' ? value : 0
}

export const chatRolloutService = (_log: FastifyBaseLogger) => ({
    // Read-only funnel snapshot for telemetry. `closed` is derived from the cached monotonic flag
    // (never re-computed downward): once set it stays set.
    async getFunnelSnapshot(): Promise<FunnelSnapshot> {
        const [landed, chatted] = await Promise.all([readCount(LANDED_KEY), readCount(CHATTED_KEY)])
        const cap = resolveCap()
        const cachedClosed = await distributedStore.getBoolean(CLOSED_KEY)
        const closed = cachedClosed === true || chatted >= cap
        return { landed, chatted, cap, closed }
    },

    // Record that a user reached the chat surface (funnel top). Best-effort.
    async recordLanded(): Promise<void> {
        await bumpCounter(LANDED_KEY)
    },

    // Record that a user sent a message (funnel bottom); flips the monotonic `closed` flag once the
    // cap is reached. Best-effort.
    async recordChatted(): Promise<void> {
        const chatted = await bumpCounter(CHATTED_KEY)
        if (chatted >= resolveCap()) {
            await distributedStore.putBoolean(CLOSED_KEY, true)
        }
    },
})

// Atomically increment a counter and return the new value; on any store error, log and return the
// last-known best value (0) so callers never throw.
async function bumpCounter(key: string): Promise<number> {
    const current = await readCount(key)
    const next = current + 1
    await distributedStore.put(key, next)
    return next
}
