// Clean-room implementation — organization-provided OAuth client credentials (capability spec
// E.3). An organization registers its OWN OAuth client credentials per integration ("block"),
// used in place of the platform defaults when brokering a connection for that integration.
//
// The client secret is sensitive: it is encrypted at rest (Part III), never returned to any
// client, and decrypted only by the server when the stored credentials are actually used. The
// registry is strictly organization-scoped — every query filters by platformId, and there is at
// most one app per (organization, integration).
import {
    IntellisperError,
    ibId,
    Cursor,
    ErrorCode,
    isNil,
    OAuthApp,
    SeekPage,
    UpsertOAuth2AppRequest,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { encryptUtils } from '../../helper/encryption'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { OAuthAppEntity, OAuthAppWithEncryptedSecret } from './oauth-app.entity'

const oauthAppRepo = repoFactory(OAuthAppEntity)

// Strip the encrypted secret from a persisted row: the public shape never carries clientSecret.
function toPublic(app: OAuthAppWithEncryptedSecret): OAuthApp {
    const { clientSecret: _clientSecret, ...publicApp } = app
    return publicApp
}

export const oauthAppService = (_log: FastifyBaseLogger) => ({
    // Register or replace the organization's credentials for an integration. Idempotent per
    // (organization, integration): re-registering the same block replaces the stored credentials
    // rather than creating a duplicate or hitting the unique index. The secret is encrypted
    // before it is stored; the returned record carries the public fields only (no secret).
    async upsert({ platformId, request }: { platformId: string, request: UpsertOAuth2AppRequest }): Promise<OAuthApp> {
        const encryptedClientSecret = await encryptUtils.encryptString(request.clientSecret)
        const existing = await oauthAppRepo().findOneBy({
            platformId,
            blockName: request.blockName,
        })
        const saved = await oauthAppRepo().save({
            id: existing?.id ?? ibId(),
            platformId,
            blockName: request.blockName,
            clientId: request.clientId,
            clientSecret: encryptedClientSecret,
        })
        return toPublic(saved)
    },

    // List the organization's registered apps (public metadata only — no secret), cursor
    // paginated and strictly scoped to the calling organization.
    async list({ platformId, cursor, limit }: { platformId: string, cursor: Cursor | null, limit: number }): Promise<SeekPage<OAuthApp>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor)
        const paginator = buildPaginator({
            entity: OAuthAppEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const queryBuilder = oauthAppRepo()
            .createQueryBuilder('oauth_app')
            .where('oauth_app."platformId" = :platformId', { platformId })
        const { data, cursor: nextCursor } = await paginator.paginate(queryBuilder)
        return paginationHelper.createPage(data.map(toPublic), nextCursor)
    },

    // Revoke an app by id, scoped to the organization so one tenant can never delete another's
    // record. Unknown id (or an id owned by a different organization) is a not-found error.
    async delete({ platformId, id }: { platformId: string, id: string }): Promise<void> {
        const existing = await oauthAppRepo().findOneBy({ platformId, id })
        if (isNil(existing)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'oauth_app', entityId: id },
            })
        }
        await oauthAppRepo().delete({ platformId, id })
    },

    // The execution accessor (E.3 "used in place of platform defaults"): the organization's
    // registered client credentials for an integration, with the secret DECRYPTED. Returns null
    // when the organization has registered no app for that integration, so the caller falls back
    // to the platform defaults. Never exposed over the API — server-side use only.
    async getWithDecryptedSecret({ platformId, blockName }: { platformId: string, blockName: string }): Promise<{ clientId: string, clientSecret: string } | null> {
        const app = await oauthAppRepo().findOneBy({ platformId, blockName })
        if (isNil(app)) {
            return null
        }
        return {
            clientId: app.clientId,
            clientSecret: await encryptUtils.decryptString(app.clientSecret),
        }
    },
})
