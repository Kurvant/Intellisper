// Clean-room implementation — connection signing keys API (capability spec E.4).
//
// This module exposes the embedded-provisioning subsystem as TWO route families under two
// DISTINCT, NON-OVERLAPPING prefixes so their paths can never collide:
//
//   /v1/connection-keys            — the workspace-scoped signing-key primitive (keypair half):
//                                    create (private returned once, public persisted), list,
//                                    delete. Every route is project-scoped; cross-project access
//                                    is rejected by the project security guard.
//
//   /v1/app-connections-from-token — the token-based provisioning protocol: PUBLIC routes whose
//                                    credential is a JWT signed with a connection key's private
//                                    half (verified against the workspace's stored public keys),
//                                    which provision / read / delete an end-user connection built
//                                    from a stored app-credential template.
//
// The two families are deliberately kept on separate prefixes rather than sharing
// `/v1/connection-keys` — a static `/app-connections` sibling of a `/:connectionkeyId` param route
// would rely on Fastify's static-over-param precedence; separating the prefixes removes that
// implicit dependency entirely. Registered in the CLOUD edition only (managed-embed capability).
import {
    AppConnectionWithoutSensitiveData,
    ConnectionKey,
    GetOrDeleteConnectionFromTokenRequest,
    ListConnectionKeysRequest,
    PrincipalType,
    SeekPage,
    UpsertConnectionFromToken,
    UpsertSigningKeyConnection,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { connectionKeyProvisioningService } from './connection-key-provisioning.service'
import { ConnectionKeyEntity } from './connection-key.entity'
import { connectionKeyService } from './connection-key.service'

const DEFAULT_LIST_LIMIT = 10

export const connectionKeyModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(connectionKeyController, { prefix: '/v1/connection-keys' })
    await app.register(connectionProvisioningController, { prefix: '/v1/app-connections-from-token' })
}

// --- Keypair primitive: /v1/connection-keys (workspace-scoped) ---
const connectionKeyController: FastifyPluginAsyncZod = async (app) => {

    // Mint a new workspace signing key. The private key is in the response ONCE and never again.
    // projectId comes from the body.
    app.post('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.BODY,
            }),
        },
        schema: {
            body: UpsertSigningKeyConnection,
        },
    }, async (request): Promise<ConnectionKey> => {
        return connectionKeyService(request.log).upsert({
            projectId: request.body.projectId,
            request: request.body,
        })
    })

    // List a workspace's connection keys (public material only). projectId comes from the query.
    app.get('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.QUERY,
            }),
        },
        schema: {
            querystring: ListConnectionKeysRequest,
        },
    }, async (request): Promise<SeekPage<ConnectionKey>> => {
        return connectionKeyService(request.log).list({
            projectId: request.query.projectId,
            cursor: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIST_LIMIT,
        })
    })

    // Delete a connection key by id. The project is resolved from the key row (:connectionkeyId).
    app.delete('/:connectionkeyId', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.TABLE,
                tableName: ConnectionKeyEntity,
                lookup: { paramKey: 'connectionkeyId', entityField: 'id' },
            }),
        },
        schema: {
            params: z.object({ connectionkeyId: z.string() }),
        },
    }, async (request, reply): Promise<void> => {
        await connectionKeyService(request.log).delete({ id: request.params.connectionkeyId })
        return reply.status(StatusCodes.OK).send()
    })
}

// --- Token-based provisioning: /v1/app-connections-from-token (PUBLIC; token is the credential) ---
const connectionProvisioningController: FastifyPluginAsyncZod = async (app) => {

    // Provision (upsert) a connection from a signed token + an app-credential template.
    app.post('/', {
        config: { security: securityAccess.public() },
        schema: { body: UpsertConnectionFromToken },
    }, async (request): Promise<AppConnectionWithoutSensitiveData> => {
        return connectionKeyProvisioningService(request.log).upsertConnection(request.body)
    })

    // Read a connection from a signed token.
    app.get('/', {
        config: { security: securityAccess.public() },
        schema: { querystring: GetOrDeleteConnectionFromTokenRequest },
    }, async (request): Promise<AppConnectionWithoutSensitiveData | null> => {
        return connectionKeyProvisioningService(request.log).getConnection(request.query)
    })

    // Delete a connection from a signed token.
    app.delete('/', {
        config: { security: securityAccess.public() },
        schema: { querystring: GetOrDeleteConnectionFromTokenRequest },
    }, async (request, reply): Promise<void> => {
        await connectionKeyProvisioningService(request.log).deleteConnection(request.query)
        return reply.status(StatusCodes.OK).send()
    })
}
