// Clean-room implementation — SAML SSO HTTP surface (capability spec B.3).
// Public browser-facing endpoints (login redirect, assertion consumer, IdP discovery) plus
// admin endpoints to administer a platform's SSO domain. The admin endpoints are gated on
// the platform having SSO licensed; the public ones resolve the platform from the request
// (or an explicit platformId, to support cloud multi-tenant callbacks).
import { ApplicationEventName, assertNotNullOrUndefined, PrincipalType } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../../helper/application-events'
import { networkUtils } from '../../../helper/network-utils'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { platformUtils } from '../../../platform/platform.utils'
import { platformMustHaveFeatureEnabled } from '../ee-authorization'
import { authnSsoSamlService } from './authn-sso-saml-service'

export const authnSsoSamlModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(authnSsoSamlController, { prefix: '/v1/authn/saml' })
}

const authnSsoSamlController: FastifyPluginAsyncZod = async (app) => {

    // Start login: redirect the browser to the platform's IdP.
    app.get('/login', LoginRequest, async (request, reply) => {
        const platformId = request.query.platformId ?? await platformUtils.getPlatformIdForRequest(request)
        assertNotNullOrUndefined(platformId, 'platformId')
        const { saml } = await authnSsoSamlService(request.log).getSamlConfigOrThrow(platformId)
        const { redirectUrl } = await authnSsoSamlService(request.log).login(platformId, saml)
        return reply.redirect(redirectUrl)
    })

    // Assertion consumer: the IdP posts the signed assertion here; on success we redirect
    // back to the app with the resulting authentication response and record the sign-in.
    app.post('/acs', AcsRequest, async (request, reply) => {
        const platformId = request.query.platformId
            ?? await platformUtils.getPlatformIdByLegacyHost(request)
            ?? await platformUtils.getPlatformIdForRequest(request)
        assertNotNullOrUndefined(platformId, 'platformId')
        const { saml } = await authnSsoSamlService(request.log).getSamlConfigOrThrow(platformId)
        const response = await authnSsoSamlService(request.log).acs(platformId, saml, {
            body: request.body,
            query: request.query,
        })
        const url = new URL('/authenticate', networkUtils.getRequestBaseUrl(request))
        url.searchParams.append('response', JSON.stringify(response))
        applicationEvents(request.log).sendUserEvent({
            platformId,
            userId: response.id,
            projectId: response.projectId ?? undefined,
            ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
        }, {
            action: ApplicationEventName.USER_SIGNED_UP,
            data: { source: 'sso' },
        })
        return reply.redirect(url.toString())
    })

    // IdP discovery: given an email domain, tell the login screen which platform (if any)
    // handles SSO for it.
    app.post('/discover', DiscoverRequest, async (request) => {
        return authnSsoSamlService(request.log).discoverByDomain(request.body.domain)
    })

    // Claim/clear this platform's SSO domain.
    app.post('/sso-domain', UpdateSsoDomainRequest, async (request) => {
        return authnSsoSamlService(request.log).updateSsoDomain({
            platformId: request.principal.platform.id,
            ssoDomain: request.body.ssoDomain,
        })
    })

    // Attempt to prove ownership of this platform's claimed SSO domain.
    app.post('/sso-domain/verify', VerifySsoDomainRequest, async (request) => {
        return authnSsoSamlService(request.log).verifySsoDomain({
            platformId: request.principal.platform.id,
        })
    })
}

const LoginRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        querystring: z.object({
            platformId: z.string().optional(),
        }),
    },
}

const AcsRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        body: z.record(z.string(), z.unknown()),
        querystring: z.object({
            platformId: z.string().optional(),
        }).catchall(z.unknown()),
    },
}

const DiscoverRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        body: z.object({
            domain: z.string().min(1).max(253),
        }),
        response: {
            200: z.object({
                platformId: z.string().nullable(),
            }),
        },
    },
}

const UpdateSsoDomainRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    preHandler: platformMustHaveFeatureEnabled((platform) => platform.plan.ssoEnabled),
    schema: {
        body: z.object({
            ssoDomain: z.string().max(253).nullable(),
        }),
    },
}

const VerifySsoDomainRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    preHandler: platformMustHaveFeatureEnabled((platform) => platform.plan.ssoEnabled),
}
