// Clean-room implementation — app-credential store (capability spec E.4, credential-template
// half). A per-workspace, per-integration OAuth2 or API-key credential TEMPLATE that the
// embedded token-provisioning flow (connection-keys) resolves to build an end-user connection.
//
// Storage model: one credential per (workspace, integration) — the unique (projectId, appName)
// index makes create an UPSERT (re-registering an app replaces its template). The OAuth2 client
// secret is sensitive: it is CENSORED on every read (never returned to a client); only the
// server-side resolution accessor exposes it, so the provisioning flow can perform the token
// exchange.
import {
    IntellisperError,
    ibId,
    AppCredential,
    AppCredentialType,
    Cursor,
    ErrorCode,
    isNil,
    OAuth2GrantType,
    SeekPage,
    UpsertAppCredentialRequest,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { AppCredentialEntity } from './app-credentials.entity'

const appCredentialRepo = repoFactory(AppCredentialEntity)

// Remove the OAuth2 client secret from a credential before it leaves the server. API-key
// templates carry no secret. The returned object is safe to expose over the API.
function censor(credential: AppCredential): AppCredential {
    if (credential.settings.type === AppCredentialType.OAUTH2) {
        const { clientSecret: _clientSecret, ...safeSettings } = credential.settings
        return { ...credential, settings: safeSettings }
    }
    return credential
}

export const appCredentialService = (_log: FastifyBaseLogger) => ({
    // Create or replace a workspace's credential template for an integration. Idempotent per
    // (projectId, appName): re-registering the same app replaces its template rather than hitting
    // the unique index. The stored OAuth2 template defaults the grant type to authorization-code
    // (the request carries no grant type). Returns the CENSORED record (no client secret).
    async upsert({ request }: { request: UpsertAppCredentialRequest }): Promise<AppCredential> {
        const existing = await appCredentialRepo().findOneBy({
            projectId: request.projectId,
            appName: request.appName,
        })
        const settings = request.settings.type === AppCredentialType.OAUTH2
            ? {
                type: AppCredentialType.OAUTH2 as const,
                authUrl: request.settings.authUrl,
                tokenUrl: request.settings.tokenUrl,
                clientId: request.settings.clientId,
                clientSecret: request.settings.clientSecret,
                scope: request.settings.scope,
                grantType: OAuth2GrantType.AUTHORIZATION_CODE,
            }
            : { type: AppCredentialType.API_KEY as const }

        const saved = await appCredentialRepo().save({
            id: existing?.id ?? request.id ?? ibId(),
            appName: request.appName,
            projectId: request.projectId,
            settings,
        })
        return censor(saved)
    },

    // List a workspace's credential templates (censored), cursor paginated, strictly workspace-
    // scoped and optionally filtered to a single integration by name.
    async list({ projectId, appName, cursor, limit }: { projectId: string, appName: string | undefined, cursor: Cursor | null, limit: number }): Promise<SeekPage<AppCredential>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor)
        const paginator = buildPaginator({
            entity: AppCredentialEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const queryBuilder = appCredentialRepo()
            .createQueryBuilder('app_credential')
            .where('app_credential."projectId" = :projectId', { projectId })
        if (!isNil(appName)) {
            queryBuilder.andWhere('app_credential."appName" = :appName', { appName })
        }
        const { data, cursor: nextCursor } = await paginator.paginate(queryBuilder)
        return paginationHelper.createPage(data.map(censor), nextCursor)
    },

    // Resolve a credential template by id, workspace-scoped, WITH the client secret intact. This
    // is the server-side accessor used by the token-provisioning flow; it is NEVER exposed over
    // the API. Unknown / foreign id → not-found (fail-safe).
    async getOneOrThrow({ id, projectId }: { id: string, projectId: string }): Promise<AppCredential> {
        const credential = await appCredentialRepo().findOneBy({ id, projectId })
        if (isNil(credential)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'app_credential', entityId: id },
            })
        }
        return credential
    },

    // The owning workspace of a credential template, or null if the id is unknown. Used by the
    // token-provisioning flow to learn which workspace's connection keys to verify a token against
    // before performing the workspace-scoped credential fetch. Server-side only.
    async findProjectId({ id }: { id: string }): Promise<string | null> {
        const credential = await appCredentialRepo().findOneBy({ id })
        return isNil(credential) ? null : credential.projectId
    },

    // Delete a credential template. The module's project guard has already confirmed workspace
    // ownership before this runs.
    async delete({ id }: { id: string }): Promise<void> {
        await appCredentialRepo().delete({ id })
    },
})
