// Discovery of BROKER-MANAGED OAuth providers (the second half of the managed-OAuth story).
//
// The broker (services/intellisper-oauth-broker) holds provider client secrets and performs the
// token exchange. This service asks the broker which providers it manages -- returning PUBLIC
// identity only, (blockName, clientId) -- so the connection dialog can offer a one-click Connect
// (CLOUD_OAUTH2) for those blocks instead of prompting the user for their own credentials.
//
// This is distinct from oauth-app.service.ts, which lists an ORGANISATION's OWN registered client
// credentials from the database (PLATFORM_OAUTH2). The two are merged in the frontend map: a block
// with a broker app becomes cloud-managed; a block with an org app becomes platform-managed.
//
// The broker call reuses the same CLOUD_OAUTH_URL / CLOUD_OAUTH_API_KEY config and the same
// SSRF-safe http client as the claim/refresh path. If the broker is unset or unreachable, this
// returns an empty list rather than throwing: managed discovery is a best-effort enhancement, and
// a broker outage must not break the connection dialog (blocks simply fall back to manual creds).
import { safeHttp } from '@intelblocks/server-utils'
import { isNil } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

export type CloudOAuthProvider = {
    blockName: string
    clientId: string
}

function brokerConfig(): { baseUrl: string, apiKey: string } | null {
    const baseUrl = system.get(AppSystemProp.CLOUD_OAUTH_URL)
    const apiKey = system.get(AppSystemProp.CLOUD_OAUTH_API_KEY)
    if (isNil(baseUrl) || baseUrl.trim() === '' || isNil(apiKey) || apiKey.trim() === '') {
        return null
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey }
}

export const cloudOAuthAppService = (log: FastifyBaseLogger) => ({
    async list(): Promise<CloudOAuthProvider[]> {
        const broker = brokerConfig()
        if (isNil(broker)) {
            // No broker configured (e.g. a self-hosted install that runs no managed OAuth): there
            // are simply no cloud-managed providers, so the dialog uses manual/platform creds.
            return []
        }
        try {
            const response = await safeHttp.retryingAxios.get<{ providers: CloudOAuthProvider[] }>(
                `${broker.baseUrl}/providers`,
                {
                    timeout: 15000,
                    headers: { authorization: `Bearer ${broker.apiKey}` },
                },
            )
            const providers = response.data?.providers
            if (!Array.isArray(providers)) {
                log.warn({ received: typeof providers }, '[cloudOAuthAppService#list] broker returned no providers array')
                return []
            }
            return providers
                .filter((p): p is CloudOAuthProvider =>
                    typeof p?.blockName === 'string' && typeof p?.clientId === 'string')
                .map((p) => ({ blockName: p.blockName, clientId: p.clientId }))
        }
        catch (error) {
            // Best-effort: a broker outage must not break the connection dialog. Log and degrade to
            // "no managed providers" so blocks fall back to manual credential entry.
            log.warn({ err: error instanceof Error ? error.message : String(error) }, '[cloudOAuthAppService#list] failed to reach broker /providers')
            return []
        }
    },
})
