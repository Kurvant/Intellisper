import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Presence service (Phase 8) — Redis-backed presence TTL + ATOMIC in-flight concurrency counter.
 * distributedStore + the shared ioredis client are mocked; the test pins that heartbeat writes a TTL
 * key, isConnected reflects it, and incr/decr use atomic INCR/DECR (clamped at 0).
 */

const { store, redis } = vi.hoisted(() => ({
    store: new Map<string, unknown>(),
    redis: { incr: vi.fn(), decr: vi.fn(), expire: vi.fn(), get: vi.fn(), set: vi.fn() },
}))

vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedStore: {
        put: async (k: string, v: unknown) => { store.set(k, v) },
        get: async (k: string) => (store.has(k) ? store.get(k) : null),
        delete: async (keys: string[]) => { keys.forEach((k) => store.delete(k)) },
    },
    redisConnections: { useExisting: async () => redis },
}))

import { browserAgentPresence } from '../../../../src/app/browser-agent/automation/presence.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const svc = () => browserAgentPresence(log)

beforeEach(() => {
    store.clear()
    redis.incr.mockReset(); redis.decr.mockReset(); redis.expire.mockReset(); redis.get.mockReset(); redis.set.mockReset()
})

describe('presence TTL', () => {
    it('heartbeat marks connected; clear marks offline', async () => {
        await svc().heartbeat('u1')
        expect(await svc().isConnected('u1')).toBe(true)
        await svc().clear('u1')
        expect(await svc().isConnected('u1')).toBe(false)
    })

    it('a user with no heartbeat is not connected', async () => {
        expect(await svc().isConnected('ghost')).toBe(false)
    })
})

describe('in-flight counter — atomic INCR/DECR', () => {
    it('incrInflight uses redis INCR + sets a safety expiry', async () => {
        redis.incr.mockResolvedValue(1)
        const n = await svc().incrInflight('u1')
        expect(n).toBe(1)
        expect(redis.incr).toHaveBeenCalledWith('ba:automation:inflight:u1')
        expect(redis.expire).toHaveBeenCalled()
    })

    it('decrInflight clamps at 0 (never negative)', async () => {
        redis.decr.mockResolvedValue(-1)
        await svc().decrInflight('u1')
        expect(redis.set).toHaveBeenCalledWith('ba:automation:inflight:u1', '0')
    })

    it('getInflight parses the stored integer (0 when absent)', async () => {
        redis.get.mockResolvedValueOnce('3')
        expect(await svc().getInflight('u1')).toBe(3)
        redis.get.mockResolvedValueOnce(null)
        expect(await svc().getInflight('u1')).toBe(0)
    })
})
