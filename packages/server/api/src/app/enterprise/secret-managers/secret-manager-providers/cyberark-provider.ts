// Clean-room implementation — CyberArk Conjur adapter (capability spec E.6). Built against
// Conjur's public REST API. Conjur is an administrator-supplied, self-hosted host, so every
// call goes through the SSRF-guarded egress client (safeHttp.retryingAxios) per the safe-http
// rule.
//
// Path grammar (provider-defined): a Conjur variable id (`secretKey`) — the fully-qualified
// variable path within the organization account.
import { safeHttp } from '@intelblocks/server-utils'
import {
    CyberarkConjurProviderConfig,
    ErrorCode,
    IntellisperError,
    isNil,
    SecretManagerProviderId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { SecretManagerProvider } from './provider'

type ConjurSession = {
    accessToken: string
}

function baseUrl(config: CyberarkConjurProviderConfig): string {
    return config.url.replace(/\/+$/, '')
}

async function authenticate(config: CyberarkConjurProviderConfig, log: FastifyBaseLogger): Promise<ConjurSession> {
    const account = encodeURIComponent(config.organizationAccountName)
    const login = encodeURIComponent(config.loginId)
    try {
        const response = await safeHttp.retryingAxios.request<string>({
            url: `${baseUrl(config)}/authn/${account}/${login}/authenticate`,
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Accept-Encoding': 'base64',
            },
            data: config.apiKey,
        })
        const rawToken = response.data
        if (isNil(rawToken) || `${rawToken}`.length === 0) {
            throw new Error('Conjur authentication returned an empty token')
        }
        // Conjur returns the access token which is presented as a base64-encoded header value.
        const accessToken = Buffer.from(`${rawToken}`).toString('base64')
        return { accessToken }
    }
    catch (error) {
        log.warn({ error }, '[CyberarkProvider] authenticate failed')
        throw new IntellisperError({
            code: ErrorCode.SECRET_MANAGER_CONNECTION_FAILED,
            params: {
                provider: SecretManagerProviderId.CYBERARK,
                message: error instanceof Error ? error.message : 'CyberArk Conjur authentication failed',
            },
        })
    }
}

export const cyberarkProvider: SecretManagerProvider<CyberarkConjurProviderConfig, ConjurSession> = {
    id: SecretManagerProviderId.CYBERARK,

    async checkConnection({ config, log }) {
        await authenticate(config, log)
        return true
    },

    async connect({ config, log }) {
        return authenticate(config, log)
    },

    async disconnect() {
        // Conjur access tokens are short-lived and self-expire; no explicit revoke.
    },

    async getSecret({ path, session, config, log }) {
        await this.validatePath(path)
        const account = encodeURIComponent(config.organizationAccountName)
        const variableId = path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
        try {
            const response = await safeHttp.retryingAxios.request<string>({
                url: `${baseUrl(config)}/secrets/${account}/variable/${variableId}`,
                method: 'GET',
                headers: {
                    Authorization: `Token token="${session.accessToken}"`,
                },
            })
            if (isNil(response.data)) {
                throw new Error(`Conjur variable "${path}" has no value`)
            }
            return `${response.data}`
        }
        catch (error) {
            log.warn({ error, path }, '[CyberarkProvider] getSecret failed')
            throw new IntellisperError({
                code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
                params: {
                    provider: SecretManagerProviderId.CYBERARK,
                    message: error instanceof Error ? error.message : 'Failed to read secret from CyberArk Conjur',
                    request: { path },
                },
            })
        }
    },

    async validatePath(path) {
        if (isNil(path) || path.trim().length === 0) {
            throw new IntellisperError({
                code: ErrorCode.VALIDATION,
                params: { message: 'CyberArk Conjur secret key must be a non-empty variable id.' },
            })
        }
    },
}
