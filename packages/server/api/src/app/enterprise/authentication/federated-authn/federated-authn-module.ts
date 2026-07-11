// Clean-room implementation — federated (social) sign-in HTTP surface (capability spec
// B.4). Public endpoints: start a provider login (returns the consent URL), and claim a
// session from the returned authorization code. A successful claim that lands on a real
// platform is recorded as a sign-in for audit.
import { ApplicationEventName, ClaimTokenRequest, isNil, ThirdPartyAuthnProviderEnum } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../../helper/application-events'
import { networkUtils } from '../../../helper/network-utils'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { platformUtils } from '../../../platform/platform.utils'
import { federatedAuthnService } from './federated-authn-service'

export const federatedAuthModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(federatedAuthnController, { prefix: '/v1/authn/federated' })
}

const federatedAuthnController: FastifyPluginAsyncZod = async (app) => {

    app.get('/login', LoginRequest, async (request) => {
        const platformId = await platformUtils.getPlatformIdForRequest(request)
        return federatedAuthnService(request.log).login({ platformId: platformId ?? undefined })
    })

    app.post('/claim', ClaimRequest, async (request) => {
        const platformId = await platformUtils.getPlatformIdForRequest(request)
        const response = await federatedAuthnService(request.log).claim({
            platformId: platformId ?? undefined,
            code: request.body.code,
        })
        if (!isNil(response.platformId)) {
            applicationEvents(request.log).sendUserEvent({
                platformId: response.platformId,
                userId: response.id,
                projectId: response.projectId ?? undefined,
                ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
            }, {
                action: ApplicationEventName.USER_SIGNED_UP,
                data: { source: 'sso' },
            })
        }
        return response
    })
}

const LoginRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        querystring: z.object({
            providerName: z.nativeEnum(ThirdPartyAuthnProviderEnum),
        }),
    },
}

const ClaimRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        body: ClaimTokenRequest,
    },
}
