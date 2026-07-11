// Clean-room implementation — token-signing key API (/v1/signing-keys, capability spec D.1).
//
// Create, list, read, and delete are ORGANIZATION-ADMINISTRATOR only and gated on the embedding
// entitlement (both enforced as route preHandlers). All reads/deletes are tenant-scoped: a key
// is addressable only within its owning organization. The create response returns the generated
// private key exactly once (the platform never stores it); listings/reads expose only public
// material and metadata. Key creation is a security-relevant event and is audit-logged (K.1).
import {
    AddSigningKeyRequestBody,
    AddSigningKeyResponse,
    ApplicationEventName,
    PrincipalType,
    SeekPage,
    SigningKey,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../helper/application-events'
import { platformMustHaveFeatureEnabled } from '../authentication/ee-authorization'
import { signingKeyService } from './signing-key-service'

export const signingKeyModule: FastifyPluginAsyncZod = async (app) => {
    // Gate the whole feature on the platform plan's embedding entitlement.
    app.addHook('preHandler', platformMustHaveFeatureEnabled((platform) => platform.plan.embeddingEnabled))
    await app.register(signingKeyController, { prefix: '/v1/signing-keys' })
}

// All CRUD is organization-administrator only (spec D.1). A non-admin user is rejected (403) by
// the security layer; a service principal acts on behalf of the organization and is allowed.
const adminOnly = { config: { security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]) } }

const signingKeyController: FastifyPluginAsyncZod = async (app) => {

    // Generate a new signing key (administrator-only). Returns the private key ONCE.
    app.post('/', {
        ...adminOnly,
        schema: { body: AddSigningKeyRequestBody },
    }, async (request, reply): Promise<AddSigningKeyResponse> => {
        const signingKey = await signingKeyService(request.log).add({
            platformId: request.principal.platform.id,
            displayName: request.body.displayName,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.SIGNING_KEY_CREATED,
            data: {
                signingKey: {
                    id: signingKey.id,
                    created: signingKey.created,
                    updated: signingKey.updated,
                    displayName: signingKey.displayName,
                },
            },
        })
        return reply.status(StatusCodes.CREATED).send(signingKey)
    })

    // List the organization's signing keys (administrator-only). Public material only.
    app.get('/', adminOnly, async (request): Promise<SeekPage<SigningKey>> => {
        return signingKeyService(request.log).list({ platformId: request.principal.platform.id })
    })

    // Read one signing key by id (administrator-only), scoped to the organization.
    app.get('/:id', {
        ...adminOnly,
        schema: { params: z.object({ id: z.string() }) },
    }, async (request): Promise<SigningKey> => {
        return signingKeyService(request.log).getOneOrThrow({
            id: request.params.id,
            platformId: request.principal.platform.id,
        })
    })

    // Delete a signing key (administrator-only), scoped to the organization.
    app.delete('/:id', {
        ...adminOnly,
        schema: { params: z.object({ id: z.string() }) },
    }, async (request, reply): Promise<void> => {
        await signingKeyService(request.log).delete({
            id: request.params.id,
            platformId: request.principal.platform.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}
