// Clean-room implementation — organization-provided OAuth client credentials (/v1/oauth-apps,
// capability spec E.3).
//
// An organization registers its own OAuth client credentials per integration, used in place of
// the platform defaults when brokering connections. All operations are ORGANIZATION-ADMINISTRATOR
// only (a non-admin user is rejected 403; a service principal acts for the organization) and are
// strictly scoped to the caller's own organization.
//
// The client secret is accepted on upsert, encrypted at rest, and NEVER returned: upsert and
// list both respond with the public record (id, blockName, platformId, clientId) and no secret.
import {
    ListOAuth2AppRequest,
    OAuthApp,
    PrincipalType,
    SeekPage,
    UpsertOAuth2AppRequest,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { cloudOAuthAppService } from './cloud-oauth-app.service'
import { oauthAppService } from './oauth-app.service'

export const oauthAppModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(oauthAppController, { prefix: '/v1/oauth-apps' })
}

// Mutations (register/replace and revoke) are organization-administrator only (spec E.3): a
// non-admin user is rejected 403 by the security layer; a service principal acts for the
// organization and is allowed.
const adminOnly = { config: { security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]) } }

// Listing is available to any authenticated member of the organization (the credential set is
// needed to establish connections), scoped by the security layer to the caller's own
// organization — a member of one organization can never read another's apps. The secret is
// never included in the response regardless of caller.
const platformScoped = { config: { security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]) } }

const oauthAppController: FastifyPluginAsyncZod = async (app) => {

    // Register or replace the organization's credentials for an integration. The secret is
    // encrypted before storage; the response carries the public record only (no secret).
    app.post('/', {
        ...adminOnly,
        schema: { body: UpsertOAuth2AppRequest },
    }, async (request): Promise<OAuthApp> => {
        return oauthAppService(request.log).upsert({
            platformId: request.principal.platform.id,
            request: request.body,
        })
    })

    // List the organization's registered apps — public metadata only, cursor paginated.
    app.get('/', {
        ...platformScoped,
        schema: { querystring: ListOAuth2AppRequest },
    }, async (request): Promise<SeekPage<OAuthApp>> => {
        return oauthAppService(request.log).list({
            platformId: request.principal.platform.id,
            cursor: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
        })
    })

    // List the BROKER-MANAGED providers (blockName + clientId only, never a secret) so the
    // connection dialog can offer one-click Connect for them. Available to any authenticated
    // member — the same audience that needs the platform app list to establish connections.
    // Best-effort: an unreachable broker yields an empty list, never an error.
    app.get('/cloud', {
        ...platformScoped,
    }, async (request): Promise<{ providers: { blockName: string, clientId: string }[] }> => {
        const providers = await cloudOAuthAppService(request.log).list()
        return { providers }
    })

    // Revoke an app by id, scoped to the organization.
    app.delete('/:id', {
        ...adminOnly,
        schema: { params: z.object({ id: z.string() }) },
    }, async (request): Promise<void> => {
        await oauthAppService(request.log).delete({
            platformId: request.principal.platform.id,
            id: request.params.id,
        })
    })
}

const DEFAULT_PAGE_SIZE = 10
