// Clean-room implementation — management API credentials (capability spec F.1).
// Organization-scoped API keys grant programmatic access to the management interface.
// The secret is returned exactly once at creation; only its SHA-256 hash and a short
// truncated prefix are stored, so the plaintext can never be recovered from storage.
// A presented key is authenticated by hashing it and matching the stored hash.
import { cryptoUtils } from '@intelblocks/server-utils'
import {
    IntellisperError,
    ibId,
    ApiKey,
    ApiKeyResponseWithValue,
    assertNotNullOrUndefined,
    ErrorCode,
    isNil,
    secureIbId,
    SeekPage,
} from '@intelblocks/shared'
import { repoFactory } from '../../core/db/repo-factory'
import { ApiKeyEntity } from './api-key-entity'

const apiKeyRepo = repoFactory<ApiKey>(ApiKeyEntity)

// The prefix marks a token as a service API key so the authentication layer routes it to
// key verification rather than JWT verification (a stable public routing contract, spec F.1).
const SECRET_PREFIX = 'sk-'
// Total length of the token (prefix + random body). Fixed at 64 characters: the 3-character
// prefix plus a 61-character high-entropy random body.
const KEY_TOTAL_LENGTH = 64
const SECRET_LENGTH = KEY_TOTAL_LENGTH - SECRET_PREFIX.length
// How much of the secret is kept in the clear for display/identification.
const TRUNCATED_LENGTH = 4

// Mint a fresh API key secret and its derived stored forms. The plaintext `secret` is
// shown to the caller once; `secretHashed` and `secretTruncated` are what persist.
export function generateApiKey(): { secret: string, secretHashed: string, secretTruncated: string } {
    const secret = SECRET_PREFIX + secureIbId(SECRET_LENGTH)
    return {
        secret,
        secretHashed: cryptoUtils.hashSHA256(secret),
        secretTruncated: secret.slice(0, TRUNCATED_LENGTH),
    }
}

export const apiKeyService = {

    // Create an organization-scoped key. Returns the record plus the one-time plaintext
    // value; subsequent reads expose only non-secret metadata.
    async add({ platformId, displayName }: { platformId: string, displayName: string }): Promise<ApiKeyResponseWithValue> {
        const generated = generateApiKey()
        const saved = await apiKeyRepo().save({
            id: ibId(),
            platformId,
            displayName,
            hashedValue: generated.secretHashed,
            truncatedValue: generated.secretTruncated,
            lastUsedAt: null,
        })
        const { hashedValue: _hashedValue, ...withoutSecret } = saved
        return { ...withoutSecret, value: generated.secret }
    },

    // Authenticate a presented key by its hash. Records last use on a hit; returns null
    // for an unrecognized key so the auth layer denies the principal.
    async getByValue(key: string): Promise<ApiKey | null> {
        assertNotNullOrUndefined(key, 'key')
        const apiKey = await apiKeyRepo().findOneBy({ hashedValue: cryptoUtils.hashSHA256(key) })
        if (isNil(apiKey)) {
            return null
        }
        await apiKeyRepo().update(apiKey.id, { lastUsedAt: new Date().toISOString() })
        return apiKey
    },

    // List an organization's keys (non-secret metadata only).
    async list({ platformId }: { platformId: string }): Promise<SeekPage<ApiKey>> {
        const data = await apiKeyRepo().findBy({ platformId })
        return { data, next: null, previous: null }
    },

    // Revoke a key.
    async delete({ platformId, id }: { platformId: string, id: string }): Promise<void> {
        const apiKey = await apiKeyRepo().findOneBy({ platformId, id })
        if (isNil(apiKey)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'api_key', entityId: id },
            })
        }
        await apiKeyRepo().delete({ platformId, id })
    },
}
