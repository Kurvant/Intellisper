// Clean-room implementation — 1Password adapter (capability spec E.6). A token-based vault:
// a single service-account token authenticates all access. Built against 1Password's public
// Connect REST API; calls go through the SSRF-guarded egress client (safeHttp).
//
// Path grammar (provider-defined): a 1Password secret reference `op://<vault>/<item>/<field>`.
import { safeHttp } from '@intelblocks/server-utils'
import {
    ErrorCode,
    IntellisperError,
    isNil,
    OnePasswordProviderConfig,
    SecretManagerProviderId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { SecretManagerProvider } from './provider'

type OnePasswordSession = {
    token: string
}

// The 1Password Connect base endpoint. A service-account token is presented as a bearer token.
const ONEPASSWORD_CONNECT_BASE = 'https://my.1password.com/api'

type ParsedReference = {
    vault: string
    item: string
    field: string
}

function parseReference(path: string): ParsedReference {
    const withoutScheme = path.startsWith('op://') ? path.slice('op://'.length) : path
    const segments = withoutScheme.split('/').filter((segment) => segment.length > 0)
    if (segments.length < 3) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: '1Password secret reference must be of the form op://<vault>/<item>/<field>.' },
        })
    }
    const [vault, item, ...fieldParts] = segments
    return { vault, item, field: fieldParts.join('/') }
}

function authHeaders(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

async function verifyToken(config: OnePasswordProviderConfig, log: FastifyBaseLogger): Promise<OnePasswordSession> {
    try {
        await safeHttp.retryingAxios.request({
            url: `${ONEPASSWORD_CONNECT_BASE}/v1/vaults`,
            method: 'GET',
            headers: authHeaders(config.serviceAccountToken),
        })
        return { token: config.serviceAccountToken }
    }
    catch (error) {
        log.warn({ error }, '[OnePasswordProvider] token verification failed')
        throw new IntellisperError({
            code: ErrorCode.SECRET_MANAGER_CONNECTION_FAILED,
            params: {
                provider: SecretManagerProviderId.ONEPASSWORD,
                message: error instanceof Error ? error.message : '1Password authentication failed',
            },
        })
    }
}

export const onePasswordProvider: SecretManagerProvider<OnePasswordProviderConfig, OnePasswordSession> = {
    id: SecretManagerProviderId.ONEPASSWORD,

    async checkConnection({ config, log }) {
        await verifyToken(config, log)
        return true
    },

    async connect({ config, log }) {
        return verifyToken(config, log)
    },

    async disconnect() {
        // A service-account token is long-lived and reused; nothing to tear down per session.
    },

    async getSecret({ path, session, log }) {
        const { vault, item, field } = parseReference(path)
        try {
            const itemResponse = await safeHttp.retryingAxios.request<{ fields?: Array<{ label?: string, id?: string, value?: string }> }>({
                url: `${ONEPASSWORD_CONNECT_BASE}/v1/vaults/${encodeURIComponent(vault)}/items/${encodeURIComponent(item)}`,
                method: 'GET',
                headers: authHeaders(session.token),
            })
            const fields = itemResponse.data?.fields ?? []
            const match = fields.find((f) => f.label === field || f.id === field)
            if (isNil(match) || isNil(match.value)) {
                throw new Error(`Field "${field}" not found in 1Password item "${item}"`)
            }
            return match.value
        }
        catch (error) {
            log.warn({ error, path }, '[OnePasswordProvider] getSecret failed')
            throw new IntellisperError({
                code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
                params: {
                    provider: SecretManagerProviderId.ONEPASSWORD,
                    message: error instanceof Error ? error.message : 'Failed to read secret from 1Password',
                    request: { path },
                },
            })
        }
    },

    async validatePath(path) {
        parseReference(path)
    },
}
