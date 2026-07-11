// Clean-room implementation — external secret-store admin API (/v1/secret-managers, spec E.6).
//
// Authorization: configuration (create/delete) and cache invalidation are ADMINISTRATOR-only
// (a service principal acts on behalf of the organization and is allowed); LISTING configured
// stores is available to any authenticated member. Every route is entitlement-gated on the
// platform plan's external-secret-store flag. Configuring/rotating/deleting a store is a
// security-relevant event and is audit-logged (spec E.6 / K.1).
import {
    ApplicationEventName,
    ConnectSecretManagerRequestSchema,
    isNil,
    PrincipalType,
    SecretManagerConnectionWithStatus,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../helper/application-events'
import { platformMustBeOwnedByCurrentUser, platformMustHaveFeatureEnabled } from '../authentication/ee-authorization'
import { secretManagersService } from './secret-managers.service'

const ListQuery = z.object({
    projectId: z.string().optional(),
})

const ClearCacheQuery = z.object({
    connectionId: z.string().optional(),
})

export const secretManagersModule: FastifyPluginAsyncZod = async (app) => {
    // Gate the whole capability on the external-secret-store entitlement.
    app.addHook('preHandler', platformMustHaveFeatureEnabled((platform) => platform.plan.secretManagersEnabled))
    await app.register(secretManagersController, { prefix: '/v1/secret-managers' })
}

const secretManagersController: FastifyPluginAsyncZod = async (app) => {

    // List configured stores (no credentials) with configured/connected status. Available to
    // any authenticated member; optionally narrowed to the stores usable by a workspace.
    app.get('/', {
        config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) },
        schema: { querystring: ListQuery },
    }, async (request): Promise<{ data: SecretManagerConnectionWithStatus[] }> => {
        const data = await secretManagersService(request.log).list({
            platformId: request.principal.platform.id,
            projectId: request.query.projectId,
        })
        return { data }
    })

    // Configure a store (administrator-only). The provider connection is exercised live before
    // persistence; the config is encrypted at rest.
    app.post('/', {
        config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) },
        schema: { body: ConnectSecretManagerRequestSchema },
    }, async (request, reply) => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        const connection = await secretManagersService(request.log).create({
            request: request.body,
            platformId: request.principal.platform.id,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.SECRET_MANAGER_CONNECTED,
            data: { secretManager: { id: connection.id, providerId: connection.providerId, name: connection.name } },
        })
        return reply.status(StatusCodes.CREATED).send(connection)
    })

    // Clear cached health/value entries (administrator/service). Registered before `/:id` so
    // the static path wins.
    app.delete('/cache', {
        config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) },
        schema: { querystring: ClearCacheQuery },
    }, async (request, reply): Promise<void> => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        await secretManagersService(request.log).clearCache({
            platformId: request.principal.platform.id,
            connectionId: isNil(request.query.connectionId) ? undefined : request.query.connectionId,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    // Disconnect (delete) a store (administrator-only).
    app.delete('/:id', {
        config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) },
        schema: { params: z.object({ id: z.string() }) },
    }, async (request, reply): Promise<void> => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        const connection = await secretManagersService(request.log).delete({
            id: request.params.id,
            platformId: request.principal.platform.id,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.SECRET_MANAGER_DISCONNECTED,
            data: { secretManager: { id: connection.id, providerId: connection.providerId, name: connection.name } },
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}
