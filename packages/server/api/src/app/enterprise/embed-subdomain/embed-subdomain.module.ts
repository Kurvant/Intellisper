// Clean-room implementation — custom embed subdomain API (`/v1/embed-subdomain`, capability spec
// D.3). An organization registers and inspects the custom hostname under which its embedded
// experience is served. The whole feature is entitlement-gated on the embedding plan flag: a
// platform without it gets 402 Payment Required. All operations are organization-administrator
// only and act on the caller's OWN organization. Registered in CLOUD / ENTERPRISE.
import {
    EmbedSubdomain,
    GenerateEmbedSubdomainRequest,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { platformMustHaveFeatureEnabledOrPaymentRequired } from '../authentication/ee-authorization'
import { embedSubdomainService } from './embed-subdomain.service'

export const embedSubdomainModule: FastifyPluginAsyncZod = async (app) => {
    // Entitlement gate: the custom-domain capability is embedding-plan only (D.3). A platform whose
    // plan lacks it is rejected 402 Payment Required before any handler runs.
    app.addHook('preHandler', platformMustHaveFeatureEnabledOrPaymentRequired((platform) => platform.plan.embeddingEnabled))
    await app.register(embedSubdomainController, { prefix: '/v1/embed-subdomain' })
}

// Organization-administrator only; a service principal acts for the organization.
const adminOnly = { config: { security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]) } }

const embedSubdomainController: FastifyPluginAsyncZod = async (app) => {

    // The caller's organization custom subdomain record, or null when none is registered.
    app.get('/', adminOnly, async (request): Promise<EmbedSubdomain | null> => {
        return embedSubdomainService(request.log).getByPlatform({
            platformId: request.principal.platform.id,
        })
    })

    // Register (or re-register) the organization's custom hostname. The hostname is validated by
    // the request schema (a lowercase FQDN, min length, with a TLD) — an invalid hostname is
    // rejected 400 before any provider call. Returns the pending record with the DNS records the
    // customer must create.
    app.post('/', {
        ...adminOnly,
        schema: { body: GenerateEmbedSubdomainRequest },
    }, async (request): Promise<EmbedSubdomain> => {
        return embedSubdomainService(request.log).generate({
            platformId: request.principal.platform.id,
            hostname: request.body.hostname,
        })
    })

    // Refresh the registration's status from the edge provider.
    app.post('/verify', adminOnly, async (request, reply): Promise<EmbedSubdomain | null> => {
        const record = await embedSubdomainService(request.log).verify({
            platformId: request.principal.platform.id,
        })
        return reply.status(StatusCodes.OK).send(record)
    })

    // Remove the organization's custom subdomain registration.
    app.delete('/', adminOnly, async (request, reply): Promise<void> => {
        await embedSubdomainService(request.log).delete({
            platformId: request.principal.platform.id,
        })
        return reply.status(StatusCodes.OK).send()
    })
}
