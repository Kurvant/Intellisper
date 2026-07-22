
import { OAuth2AuthorizationMethod } from '@intelblocks/blocks-framework'
import { safeHttp } from '@intelblocks/server-utils'
import {
    AppConnectionType,
    CloudOAuth2ConnectionValue,
    ErrorCode,
    IntellisperError,
    isNil,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'
import {
    ClaimOAuth2Request,
    OAuth2Service,
    RefreshOAuth2Request,
} from '../oauth2-service'

/**
 * The managed OAuth broker Intellisper runs (services/oauth-broker). It holds the provider client
 * secrets and performs the token exchange, so those secrets live in ONE isolated service rather than
 * in this app or any customer's database — the same model self-hosted instances point at.
 *
 * The URL and shared API key are required config: there is deliberately NO default (the pre-rebrand
 * code hardcoded secrets.activepieces.com, which we must never call).
 */
function brokerConfig(): { baseUrl: string, apiKey: string } {
    const baseUrl = system.get(AppSystemProp.CLOUD_OAUTH_URL)
    const apiKey = system.get(AppSystemProp.CLOUD_OAUTH_API_KEY)
    if (isNil(baseUrl) || baseUrl.trim() === '' || isNil(apiKey) || apiKey.trim() === '') {
        throw new IntellisperError({
            code: ErrorCode.SYSTEM_PROP_NOT_DEFINED,
            params: { prop: AppSystemProp.CLOUD_OAUTH_URL },
        })
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey }
}

export const cloudOAuth2Service = (log: FastifyBaseLogger): OAuth2Service<CloudOAuth2ConnectionValue> => ({
    refresh: async ({
        blockName,
        connectionValue,
    }: RefreshOAuth2Request<CloudOAuth2ConnectionValue>): Promise<CloudOAuth2ConnectionValue> => {
        const requestBody = {
            refreshToken: connectionValue.refresh_token,
            blockName,
            clientId: connectionValue.client_id,
            edition: system.getEdition(),
            authorizationMethod: connectionValue.authorization_method,
            tokenUrl: connectionValue.token_url,
        }
        const broker = brokerConfig()
        const response = (
            await safeHttp.retryingAxios.post(`${broker.baseUrl}/refresh`, requestBody, {
                timeout: 20000,
                headers: { authorization: `Bearer ${broker.apiKey}` },
            })
        ).data
        return {
            ...connectionValue,
            ...response,
            props: connectionValue.props,
            type: AppConnectionType.CLOUD_OAUTH2,
        }
    },
    claim: async ({
        request,
        blockName,
    }: ClaimOAuth2Request): Promise<CloudOAuth2ConnectionValue> => {
        try {
            const cloudRequest: ClaimWithCloudRequest = {
                code: request.code,
                codeVerifier: request.codeVerifier,
                authorizationMethod: request.authorizationMethod,
                clientId: request.clientId,
                tokenUrl: request.tokenUrl,
                blockName,
                edition: system.getEdition(),
            }
            const broker = brokerConfig()
            const value = (
                await safeHttp.retryingAxios.post<CloudOAuth2ConnectionValue>(
                    `${broker.baseUrl}/claim`,
                    cloudRequest,
                    {
                        timeout: 10000,
                        headers: { authorization: `Bearer ${broker.apiKey}` },
                    },
                )
            ).data
            return {
                ...value,
                token_url: request.tokenUrl,
                props: request.props,
            }
        }
        catch (e: unknown) {
            log.error(e)
            throw new IntellisperError({
                code: ErrorCode.INVALID_CLOUD_CLAIM,
                params: {
                    blockName,
                },
            })
        }
    },
})

type ClaimWithCloudRequest = {
    blockName: string
    code: string
    codeVerifier: string | undefined
    authorizationMethod: OAuth2AuthorizationMethod | undefined
    edition: string
    clientId: string
    tokenUrl: string
}
