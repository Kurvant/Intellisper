// Clean-room implementation — app-credential store API (`/v1/app-credentials`, capability spec
// E.4). A workspace registers OAuth2 / API-key credential TEMPLATES per integration; the embedded
// token-provisioning flow (connection-keys) resolves them to build end-user connections.
//
// Authorization:
//  - Create / delete are workspace-scoped: the caller must belong to the workspace (create's
//    projectId is in the body; delete resolves the workspace from the credential row).
//  - List is PUBLIC but requires a projectId (it is read by the embedded client, which presents a
//    project-scoped token rather than a session); the client secret is CENSORED from the response.
// Registered in the CLOUD edition only (managed-embed capability).
import {
    AppCredential,
    ListAppCredentialsRequest,
    PrincipalType,
    SeekPage,
    UpsertAppCredentialRequest,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { AppCredentialEntity } from './app-credentials.entity'
import { appCredentialService } from './app-credentials.service'

const DEFAULT_LIST_LIMIT = 10

export const appCredentialModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(appCredentialController, { prefix: '/v1/app-credentials' })
}

const appCredentialController: FastifyPluginAsyncZod = async (app) => {

    // Register (upsert) a workspace credential template. projectId comes from the body. Returns
    // the censored record (no client secret).
    app.post('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.BODY,
            }),
        },
        schema: {
            body: UpsertAppCredentialRequest,
        },
    }, async (request): Promise<AppCredential> => {
        return appCredentialService(request.log).upsert({ request: request.body })
    })

    // List a workspace's credential templates (censored), filtered optionally by appName. Public
    // but requires projectId (presented by the embedded client).
    app.get('/', {
        config: {
            security: securityAccess.public(),
        },
        schema: {
            querystring: ListAppCredentialsRequest,
        },
    }, async (request): Promise<SeekPage<AppCredential>> => {
        return appCredentialService(request.log).list({
            projectId: request.query.projectId,
            appName: request.query.appName,
            cursor: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIST_LIMIT,
        })
    })

    // Delete a credential template by id. The project is resolved from the credential row (:id),
    // so a cross-workspace delete is rejected 403 and an unknown id is 404.
    app.delete('/:id', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.TABLE,
                tableName: AppCredentialEntity,
            }),
        },
        schema: {
            params: z.object({ id: z.string() }),
        },
    }, async (request, reply): Promise<void> => {
        await appCredentialService(request.log).delete({ id: request.params.id })
        return reply.status(StatusCodes.OK).send()
    })
}
