// Clean-room implementation — managed model-provider key brokering (capability spec
// H.1). Provisions and manages a per-organization provider key against the model
// gateway's public provisioning API, so end-users never handle a provider key and the
// operator can meter/limit spend per organization.
//
// The provisioning key (the operator-held credential that mints per-organization keys)
// is server-side only and is read from configuration; it is never exposed to clients.
// All outbound calls go through the SSRF-filtered HTTP client per the safe-http rule.
import { safeHttp } from '@intelblocks/server-utils'
import { ErrorCode, IntellisperError, isNil } from '@intelblocks/shared'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'

const PROVISIONING_BASE_URL = 'https://openrouter.ai/api/v1/keys'

// A managed key as reported by the gateway. Balances are expressed in the provider's
// native currency unit (USD); the credits service converts to internal credits.
export type ManagedProviderKey = {
    hash: string
    name?: string
    limit: number | null
    limit_remaining?: number | null
    usage?: number | null
    usage_monthly?: number | null
    disabled?: boolean
}

function provisioningKeyOrThrow(): string {
    const key = system.get(AppSystemProp.OPENROUTER_PROVISION_KEY)
    if (isNil(key) || key.length === 0) {
        throw new IntellisperError({
            code: ErrorCode.FEATURE_DISABLED,
            params: { message: 'Managed AI provider access is not configured (missing provisioning key).' },
        })
    }
    return key
}

function authHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${provisioningKeyOrThrow()}`,
        'Content-Type': 'application/json',
    }
}

export const openRouterApi = {
    // Mint a new per-organization managed key with an initial spend limit. Returns the
    // usable secret once (never persisted here) alongside the durable key handle.
    async createKey(params: { name: string, limit: number }): Promise<{ key: string, data: ManagedProviderKey }> {
        const response = await safeHttp.retryingAxios.post<{ key: string, data: ManagedProviderKey }>(
            PROVISIONING_BASE_URL,
            { name: params.name, limit: params.limit },
            { headers: authHeaders(), timeout: 20000 },
        )
        return response.data
    },

    // Read the current state of a managed key (limit, remaining, usage) by its handle.
    async getKey(params: { hash: string }): Promise<{ data: ManagedProviderKey }> {
        const response = await safeHttp.retryingAxios.get<{ data: ManagedProviderKey }>(
            `${PROVISIONING_BASE_URL}/${params.hash}`,
            { headers: authHeaders(), timeout: 20000 },
        )
        return response.data
    },

    // Adjust a managed key's spend limit (used by top-up and monthly renewal).
    async updateKey(params: { hash: string, limit: number }): Promise<{ data: ManagedProviderKey }> {
        const response = await safeHttp.retryingAxios.patch<{ data: ManagedProviderKey }>(
            `${PROVISIONING_BASE_URL}/${params.hash}`,
            { limit: params.limit },
            { headers: authHeaders(), timeout: 20000 },
        )
        return response.data
    },
}
