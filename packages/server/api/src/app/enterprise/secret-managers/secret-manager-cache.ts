// Clean-room implementation — the secret-manager distributed cache (capability spec E.6).
//
// Two distinct cached artifacts, each with a bounded TTL and keyed by organization + connection
// (values additionally + path):
//   - connection HEALTH: only a *successful* check is cached (asymmetric), so a transient
//     outage is never pinned as unhealthy for the TTL.
//   - resolved VALUES: cached ENCRYPTED (never in clear) — the plaintext secret is encrypted
//     before it touches the store and decrypted only on read.
//
// The store is the shared/distributed Redis (coherent across API instances), not per-process.
// Invalidation is scoped: a whole organization, or a single connection within it. It is
// implemented by SCAN + delete over the key namespace so it removes both artifacts.
import { createHash } from 'node:crypto'
import { ibDayjsDuration } from '@intelblocks/server-utils'
import { redisConnections, redisHelper } from '../../database/redis'
import { distributedStore } from '../../database/redis-connections'
import { EncryptedObject, encryptUtils } from '../../helper/encryption'

const HEALTH_TTL_SECONDS = ibDayjsDuration(5, 'minute').asSeconds()
const VALUE_TTL_SECONDS = ibDayjsDuration(5, 'minute').asSeconds()

const KEY_PREFIX = 'secretmanager'

function healthKey(platformId: string, connectionId: string): string {
    return `${KEY_PREFIX}:health:${platformId}:${connectionId}`
}

function valueKey(platformId: string, connectionId: string, path: string): string {
    // The path is hashed so an arbitrary provider path can never break the key grammar and a
    // path is never exposed in a key.
    const pathHash = createHash('sha256').update(path).digest('hex')
    return `${KEY_PREFIX}:value:${platformId}:${connectionId}:${pathHash}`
}

export const secretManagerCache = {
    // Read a cached healthy status. Returns true only when a prior successful check is cached;
    // null means "not cached" (the caller must perform a live check).
    async getHealth(params: { platformId: string, connectionId: string }): Promise<boolean | null> {
        return distributedStore.get<boolean>(healthKey(params.platformId, params.connectionId))
    },

    // Cache a *successful* health check only (asymmetric), with a bounded TTL. A failed check
    // is never written here.
    async setHealthy(params: { platformId: string, connectionId: string }): Promise<void> {
        await distributedStore.put(healthKey(params.platformId, params.connectionId), true, HEALTH_TTL_SECONDS)
    },

    // Read a cached secret value, decrypting it. null means "not cached".
    async getValue(params: { platformId: string, connectionId: string, path: string }): Promise<string | null> {
        const encrypted = await distributedStore.get<EncryptedObject>(valueKey(params.platformId, params.connectionId, params.path))
        if (!encrypted) {
            return null
        }
        return encryptUtils.decryptString(encrypted)
    },

    // Cache a resolved secret value ENCRYPTED (never in clear).
    async setValue(params: { platformId: string, connectionId: string, path: string, value: string }): Promise<void> {
        const encrypted = await encryptUtils.encryptString(params.value)
        await distributedStore.put(valueKey(params.platformId, params.connectionId, params.path), encrypted, VALUE_TTL_SECONDS)
    },

    // Invalidate cached entries. Scoped to a single connection when connectionId is given,
    // otherwise the whole organization. Removes BOTH health and value artifacts so neither a
    // stale secret nor a stale health status is ever served after a configuration change.
    async invalidateConnectionEntries(params: { platformId: string, connectionId?: string }): Promise<void> {
        const pattern = params.connectionId
            ? `${KEY_PREFIX}:*:${params.platformId}:${params.connectionId}*`
            : `${KEY_PREFIX}:*:${params.platformId}:*`
        const redis = await redisConnections.useExisting()
        const keys = await redisHelper.scanAll(redis, pattern)
        if (keys.length > 0) {
            await distributedStore.delete(keys)
        }
    },
}
