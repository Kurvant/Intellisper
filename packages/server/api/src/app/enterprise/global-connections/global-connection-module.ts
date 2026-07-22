// Clean-room implementation — organization-shared connections API (/v1/global-connections,
// capability spec E.1). A shared connection is defined once at the organization (platform)
// level and attached to multiple workspaces (its projectIds). Configuration (upsert / update /
// delete) and listing are ALL administrator-only. The connection value is validated,
// secret-manager references in it are resolved for validation but the original reference is
// persisted (never the resolved secret), and it is encrypted at rest — all handled by the
// shared appConnectionService, which this module drives with PLATFORM scope.
import {
    AppConnectionScope,
    AppConnectionWithoutSensitiveData,
    ApplicationEventName,
    ibId,
    ListGlobalConnectionsRequestQuery,
    PrincipalType,
    SeekPage,
    UpdateGlobalConnectionValueRequestBody,
    UpsertGlobalConnectionRequestBody,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { appConnectionService } from '../../app-connection/app-connection-service/app-connection-service'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../helper/application-events'
import { platformMustBeOwnedByCurrentUser, platformMustHaveFeatureEnabled } from '../authentication/ee-authorization'

const DEFAULT_LIST_LIMIT = 100

export const globalConnectionModule: FastifyPluginAsyncZod = async (app) => {
    // Organization-shared connections are entitlement-gated (spec E.1). Gate the whole feature on
    // the shared-connections plan flag: a platform whose plan does not include it cannot manage
    // shared connections directly (the base project reconciliation path silently ignores the
    // feature when disabled; here a direct management call is rejected with AUTHORIZATION 403).
    app.addHook('preHandler', platformMustHaveFeatureEnabled((platform) => platform.plan.globalConnectionsEnabled))
    await app.register(globalConnectionController, { prefix: '/v1/global-connections' })
}

const adminOnly = { config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) } }

const globalConnectionController: FastifyPluginAsyncZod = async (app) => {

    // Upsert an organization-shared connection (administrator-only). A fresh external id is
    // minted for a new connection; invalid project ids are rejected (404) by the service.
    app.post('/', {
        ...adminOnly,
        schema: {
            tags: ['global-connections'],
            summary: 'Upsert a global connection',
            description: 'Create or update an organization-shared connection (administrator-only).',
            body: UpsertGlobalConnectionRequestBody,
        },
    }, async (request, reply): Promise<AppConnectionWithoutSensitiveData> => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        const body = request.body
        const connection = await appConnectionService(request.log).upsert({
            platformId: request.principal.platform.id,
            scope: AppConnectionScope.PLATFORM,
            projectIds: body.projectIds,
            externalId: body.externalId ?? ibId(),
            ownerId: null,
            displayName: body.displayName,
            blockName: body.blockName,
            blockVersion: body.blockVersion,
            type: body.type,
            value: body.value,
            metadata: body.metadata,
            preSelectForNewProjects: body.preSelectForNewProjects,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_UPSERTED,
            data: { connection: toAuditConnection(connection) },
        })
        return reply.status(StatusCodes.CREATED).send(connection)
    })

    // List the organization's shared connections (administrator-only).
    app.get('/', {
        ...adminOnly,
        schema: {
            tags: ['global-connections'],
            summary: 'List global connections',
            description: 'List the organization\'s shared connections (administrator-only).',
            querystring: ListGlobalConnectionsRequestQuery,
        },
    }, async (request, reply): Promise<SeekPage<AppConnectionWithoutSensitiveData>> => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        const page = await appConnectionService(request.log).listForPlatform({
            platformId: request.principal.platform.id,
            scope: AppConnectionScope.PLATFORM,
            blockName: request.query.blockName,
            displayName: request.query.displayName,
            status: request.query.status,
            projectIds: undefined,
            ownerIds: undefined,
            cursorRequest: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIST_LIMIT,
        })
        // `listForPlatform` already returns a fully-formed SeekPage (its next/previous cursors are
        // encoded by the underlying list call). Re-wrapping it would discard those cursors.
        return { ...page, data: page.data as unknown as AppConnectionWithoutSensitiveData[] }
    })

    // Update a shared connection's display name / workspace attachments (administrator-only).
    app.post('/:id', {
        ...adminOnly,
        schema: {
            tags: ['global-connections'],
            summary: 'Update a global connection',
            description: 'Update a shared connection\'s display name / workspace attachments (administrator-only).',
            params: z.object({ id: z.string() }),
            body: UpdateGlobalConnectionValueRequestBody,
        },
    }, async (request, reply): Promise<AppConnectionWithoutSensitiveData> => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        const connection = await appConnectionService(request.log).update({
            id: request.params.id,
            platformId: request.principal.platform.id,
            scope: AppConnectionScope.PLATFORM,
            projectIds: null,
            request: {
                displayName: request.body.displayName,
                projectIds: request.body.projectIds ?? null,
                metadata: request.body.metadata,
                preSelectForNewProjects: request.body.preSelectForNewProjects,
            },
        })
        // An update changes a governance-relevant resource (display name / workspace attachments)
        // — audit it as a connection upsert (spec K.1), matching the base connection controller.
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_UPSERTED,
            data: { connection: toAuditConnection(connection) },
        })
        return reply.status(StatusCodes.OK).send(connection)
    })

    // Disconnect (delete) a shared connection (administrator-only).
    app.delete('/:id', {
        ...adminOnly,
        schema: {
            tags: ['global-connections'],
            summary: 'Delete a global connection',
            description: 'Disconnect (delete) a shared connection (administrator-only).',
            params: z.object({ id: z.string() }),
        },
    }, async (request, reply): Promise<void> => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        await appConnectionService(request.log).delete({
            id: request.params.id,
            platformId: request.principal.platform.id,
            scope: AppConnectionScope.PLATFORM,
            projectId: null,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_DELETED,
            data: { connection: toAuditConnection({ id: request.params.id }) },
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

// Minimal, non-sensitive projection used for the audit event (spec K.1). Never includes value.
function toAuditConnection(connection: Partial<AppConnectionWithoutSensitiveData> & { id: string }): {
    id: string
    displayName: string
    externalId: string
    blockName: string
    status: string
    type: string
    created: string
    updated: string
} {
    return {
        id: connection.id,
        displayName: connection.displayName ?? '',
        externalId: connection.externalId ?? '',
        blockName: connection.blockName ?? '',
        status: connection.status ?? '',
        type: connection.type ?? '',
        created: connection.created ?? new Date().toISOString(),
        updated: connection.updated ?? new Date().toISOString(),
    }
}
