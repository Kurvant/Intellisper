// Clean-room implementation — server-mediated OAuth2 connection brokering (capability spec E.2).
//
// The platform brokers the OAuth 2.0 authorization-code flow on behalf of a workspace connection
// so the end-user NEVER handles the client secret. The client credentials are the organization's
// own registered OAuth app for the integration (spec E.3, `oauthAppService`) — the server holds
// the secret, exchanges the authorization code for tokens (claim), and later exchanges the
// refresh token for a fresh access token (refresh). The persisted connection value carries the
// public `client_id` and the tokens, but NEVER the client secret (see `PlatformOAuth2ConnectionValue`,
// which has no `client_secret` field) — the secret is re-resolved server-side on every refresh.
//
// Installed via `setPlatformOAuthService` only in CLOUD / ENTERPRISE. Fail-safe (Part III): if the
// organization has registered no OAuth app for the integration there is no secret to broker with,
// so claim/refresh error rather than proceeding with a missing credential.
import { OAuth2AuthorizationMethod } from '@intelblocks/blocks-framework'
import { safeHttp } from '@intelblocks/server-utils'
import {
    AppConnectionType,
    BaseOAuth2ConnectionValue,
    ErrorCode,
    IntellisperError,
    isNil,
    OAuth2GrantType,
    PlatformOAuth2ConnectionValue,
} from '@intelblocks/shared'
import { AxiosError } from 'axios'
import { FastifyBaseLogger } from 'fastify'
import {
    ClaimOAuth2Request,
    OAuth2Service,
    RefreshOAuth2Request,
} from '../../app-connection/app-connection-service/oauth2/oauth2-service'
import { oauth2Util } from '../../app-connection/app-connection-service/oauth2/oauth2-util'
import { oauthAppService } from '../oauth-apps/oauth-app.service'

// Resolve the organization's registered client secret for an integration (spec E.3). The client
// id is taken from the caller (it is public and already on the request/value); only the secret is
// server-held. No registered app → the platform cannot broker this connection (fail-safe error).
async function resolveClientSecret(log: FastifyBaseLogger, platformId: string, blockName: string): Promise<string> {
    const app = await oauthAppService(log).getWithDecryptedSecret({ platformId, blockName })
    if (isNil(app)) {
        throw new IntellisperError({
            code: ErrorCode.INVALID_APP_CONNECTION,
            params: { error: `No platform OAuth app is configured for piece ${blockName}` },
        })
    }
    return app.clientSecret
}

// Build the token-endpoint auth: the client id/secret go in the body or a Basic header per the
// configured method (default BODY). The secret is applied here and never leaves the server.
function applyClientAuth(
    body: Record<string, string>,
    headers: Record<string, string>,
    authorizationMethod: OAuth2AuthorizationMethod,
    clientId: string,
    clientSecret: string,
): void {
    switch (authorizationMethod) {
        case OAuth2AuthorizationMethod.BODY:
            body.client_id = clientId
            body.client_secret = clientSecret
            break
        case OAuth2AuthorizationMethod.HEADER:
            headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
            break
        default:
            throw new Error(`Unknown authorization method: ${authorizationMethod}`)
    }
}

export const platformOAuth2Service = (log: FastifyBaseLogger): OAuth2Service<PlatformOAuth2ConnectionValue> => ({
    // Exchange the authorization code for tokens, server-side, using the organization's registered
    // client secret. Returns the connection value WITHOUT the secret.
    async claim({ platformId, blockName, request }: ClaimOAuth2Request): Promise<PlatformOAuth2ConnectionValue> {
        const clientSecret = await resolveClientSecret(log, platformId, blockName)
        const authorizationMethod = request.authorizationMethod ?? OAuth2AuthorizationMethod.BODY
        try {
            const body: Record<string, string> = {
                grant_type: OAuth2GrantType.AUTHORIZATION_CODE,
                redirect_uri: request.redirectUrl!,
                code: request.code,
            }
            if (request.codeVerifier) {
                body.code_verifier = request.codeVerifier
            }
            const headers: Record<string, string> = {
                'content-type': 'application/x-www-form-urlencoded',
                accept: 'application/json',
            }
            applyClientAuth(body, headers, authorizationMethod, request.clientId, clientSecret)

            const response = (
                await safeHttp.retryingAxios.post(request.tokenUrl, new URLSearchParams(body), {
                    headers,
                    timeout: 20000,
                })
            ).data
            return {
                type: AppConnectionType.PLATFORM_OAUTH2,
                ...oauth2Util(log).formatOAuth2Response(response),
                token_url: request.tokenUrl,
                client_id: request.clientId,
                redirect_url: request.redirectUrl!,
                grant_type: OAuth2GrantType.AUTHORIZATION_CODE,
                props: request.props,
                authorization_method: authorizationMethod,
            }
        }
        catch (e: unknown) {
            if (e instanceof AxiosError) {
                log.error({ data: e.response?.data, clientId: request.clientId, tokenUrl: request.tokenUrl }, '[platformOAuth2Service] claim failed')
            }
            else {
                log.error({ error: e }, '[platformOAuth2Service] claim failed')
            }
            throw new IntellisperError({
                code: ErrorCode.INVALID_CLAIM,
                params: {
                    clientId: request.clientId,
                    tokenUrl: request.tokenUrl,
                    redirectUrl: request.redirectUrl ?? '',
                    message: e instanceof AxiosError ? (e.response?.data?.error_description ?? 'unknown error') : 'unknown error',
                },
            })
        }
    },

    // Refresh an expiring access token via the refresh_token grant, server-side. The secret is
    // re-resolved from the organization's registered app; a non-expired connection is returned
    // untouched. A missing refresh token merges only non-null fields so it is never clobbered.
    async refresh({ platformId, blockName, connectionValue }: RefreshOAuth2Request<PlatformOAuth2ConnectionValue>): Promise<PlatformOAuth2ConnectionValue> {
        if (!oauth2Util(log).isExpired(connectionValue)) {
            return connectionValue
        }
        const clientSecret = await resolveClientSecret(log, platformId, blockName)
        const authorizationMethod = connectionValue.authorization_method ?? OAuth2AuthorizationMethod.BODY

        const body: Record<string, string> = {
            grant_type: 'refresh_token',
            refresh_token: connectionValue.refresh_token,
        }
        const headers: Record<string, string> = {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
        }
        applyClientAuth(body, headers, authorizationMethod, connectionValue.client_id, clientSecret)

        const response = (
            await safeHttp.retryingAxios.post(connectionValue.token_url, new URLSearchParams(body), {
                headers,
                timeout: 20000,
            })
        ).data
        const mergedObject = mergeNonNull(
            connectionValue,
            oauth2Util(log).formatOAuth2Response({ ...response }),
        )
        return {
            ...mergedObject,
            props: connectionValue.props,
        }
    },
})

// Merge only the non-null fields of the refresh response onto the existing connection, so a null
// refresh_token in the response never overwrites the original one.
function mergeNonNull(
    connectionValue: PlatformOAuth2ConnectionValue,
    oAuth2Response: BaseOAuth2ConnectionValue,
): PlatformOAuth2ConnectionValue {
    const nonNull = Object.fromEntries(
        Object.entries(oAuth2Response).filter(([, value]) => !isNil(value)),
    )
    return {
        ...connectionValue,
        ...nonNull,
    }
}
