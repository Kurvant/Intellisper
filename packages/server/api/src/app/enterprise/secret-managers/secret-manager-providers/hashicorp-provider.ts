// Clean-room implementation — HashiCorp Vault adapter (capability spec E.6). Authenticates
// with the AppRole method (role id + secret id) and reads KV secrets. Vault is an
// administrator-supplied, self-hosted host, so every call goes through the SSRF-guarded
// egress client (safeHttp.retryingAxios) per the safe-http rule.
//
// Path grammar (provider-defined): `<mount>/<...>/<field>` — at least three '/'-delimited
// segments, where the final segment is the field to extract from the secret and the preceding
// segments are the Vault read path (for KV v2 this includes the `data/` infix, e.g.
// `secret/data/keys/my-key`).
import { safeHttp } from '@intelblocks/server-utils'
import {
    ErrorCode,
    HashicorpProviderConfig,
    IntellisperError,
    isNil,
    SecretManagerProviderId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { SecretManagerProvider } from './provider'

type VaultSession = {
    token: string
}

function baseUrl(config: HashicorpProviderConfig): string {
    return config.url.replace(/\/+$/, '')
}

function vaultHeaders(config: HashicorpProviderConfig, token?: string): Record<string, string> {
    const headers: Record<string, string> = {}
    if (!isNil(token)) {
        headers['X-Vault-Token'] = token
    }
    if (!isNil(config.namespace) && config.namespace.trim() !== '') {
        headers['X-Vault-Namespace'] = config.namespace
    }
    return headers
}

// Provider-defined path grammar validation (exported: the reference token's path part is
// validated here). Rejects a path that lacks a '/' separator or has fewer than 3 segments.
export async function validatePathFormat(path: string): Promise<void> {
    if (!path.includes('/')) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: 'HashiCorp secret path must contain a "/" separator (e.g. secret/data/keys/my-key).' },
        })
    }
    const segments = path.split('/').filter((segment) => segment.length > 0)
    if (segments.length < 3) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: 'HashiCorp secret path must have at least 3 parts (e.g. secret/data/keys/my-key).' },
        })
    }
}

async function login(config: HashicorpProviderConfig, log: FastifyBaseLogger): Promise<VaultSession> {
    try {
        const response = await safeHttp.retryingAxios.request<{ auth?: { client_token?: string } }>({
            url: `${baseUrl(config)}/v1/auth/approle/login`,
            method: 'POST',
            headers: vaultHeaders(config),
            data: {
                role_id: config.roleId,
                secret_id: config.secretId,
            },
        })
        const token = response.data?.auth?.client_token
        if (isNil(token)) {
            throw new Error('Vault login returned no client token')
        }
        return { token }
    }
    catch (error) {
        log.warn({ error }, '[HashicorpProvider] login failed')
        throw new IntellisperError({
            code: ErrorCode.SECRET_MANAGER_CONNECTION_FAILED,
            params: {
                provider: SecretManagerProviderId.HASHICORP,
                message: error instanceof Error ? error.message : 'HashiCorp Vault authentication failed',
            },
        })
    }
}

// Determine whether the mount backing a read path is KV v2 (which requires the `data/` infix).
async function isKvV2Mount(config: HashicorpProviderConfig, token: string, mount: string, log: FastifyBaseLogger): Promise<boolean> {
    try {
        const response = await safeHttp.retryingAxios.request<Record<string, { type?: string, options?: { version?: string } }>>({
            url: `${baseUrl(config)}/v1/sys/mounts`,
            method: 'GET',
            headers: vaultHeaders(config, token),
        })
        const mounts = response.data ?? {}
        const entry = mounts[`${mount}/`] ?? mounts[mount]
        return !isNil(entry) && entry.type === 'kv' && entry.options?.version === '2'
    }
    catch (error) {
        // If the mount metadata is unreadable, assume KV v2 (the modern default); a wrong guess
        // surfaces as a clear get-secret failure rather than a silent success.
        log.debug({ error }, '[HashicorpProvider] could not read sys/mounts; assuming KV v2')
        return true
    }
}

export const hashicorpProvider: SecretManagerProvider<HashicorpProviderConfig, VaultSession> = {
    id: SecretManagerProviderId.HASHICORP,

    async checkConnection({ config, log }) {
        await login(config, log)
        return true
    },

    async connect({ config, log }) {
        return login(config, log)
    },

    async disconnect() {
        // AppRole tokens are short-lived and self-expire; no explicit revoke needed.
    },

    async getSecret({ path, session, config, log }) {
        await this.validatePath(path)
        const segments = path.split('/').filter((segment) => segment.length > 0)
        const field = segments[segments.length - 1]
        const readSegments = segments.slice(0, -1)
        const mount = readSegments[0]

        try {
            const isV2 = await isKvV2Mount(config, session.token, mount, log)
            // For KV v2 the read path already carries the `data/` infix supplied by the author;
            // for v1 it is a plain path. Either way we read the join of readSegments.
            const readPath = readSegments.join('/')
            const response = await safeHttp.retryingAxios.request<{ data?: { data?: Record<string, unknown> } | Record<string, unknown> }>({
                url: `${baseUrl(config)}/v1/${readPath}`,
                method: 'GET',
                headers: vaultHeaders(config, session.token),
            })
            // KV v2 nests the secret under data.data; KV v1 returns it directly under data.
            const outer = response.data?.data
            const secretData = (isV2 ? (outer as { data?: Record<string, unknown> })?.data : outer) as Record<string, unknown> | undefined
            const value = secretData?.[field]
            if (isNil(value)) {
                throw new Error(`Secret field "${field}" not found at path "${readPath}"`)
            }
            return typeof value === 'string' ? value : JSON.stringify(value)
        }
        catch (error) {
            log.warn({ error, path }, '[HashicorpProvider] getSecret failed')
            throw new IntellisperError({
                code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
                params: {
                    provider: SecretManagerProviderId.HASHICORP,
                    message: error instanceof Error ? error.message : 'Failed to read secret from HashiCorp Vault',
                    request: { path },
                },
            })
        }
    },

    async validatePath(path) {
        await validatePathFormat(path)
    },
}
