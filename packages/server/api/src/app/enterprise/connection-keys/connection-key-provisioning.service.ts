// Clean-room implementation — token-based connection provisioning (capability spec E.4, the
// embedded-provisioning protocol). An embedded host mints a short JWT signed with a workspace
// connection key's PRIVATE half; the server verifies it against that workspace's stored PUBLIC
// keys and provisions an end-user connection from a stored app-credential template — so the
// browser never handles a client secret.
//
// Token contract (standard JWT conventions, RS256):
//   - signed with a connection-key private half (the workspace mints it client-side);
//   - `sub` = the connection NAME (the stable external identifier for the provisioned connection);
//   - verified here against EACH registered public key for the workspace until one validates
//     (key rotation friendly). A token that validates against no key is rejected (fail-safe).
//
// Provisioning: the app-credential (resolved by id, workspace-scoped) supplies the integration
// name and, for OAuth2, the client credentials + token endpoint; the resulting connection is
// upserted with external id `{appName}_{sub}` so re-provisioning the same named connection
// replaces it. OAuth2 performs the authorization-code exchange server-side (via the app-connection
// service's validation path); API-key stores the presented key as a secret-text value.
import {
    IntellisperError,
    AppConnectionScope,
    AppConnectionStatus,
    AppConnectionType,
    AppConnectionWithoutSensitiveData,
    AppCredential,
    AppCredentialType,
    ErrorCode,
    GetOrDeleteConnectionFromTokenRequest,
    isNil,
    OAuth2GrantType,
    UpsertConnectionFromToken,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { appConnectionService } from '../../app-connection/app-connection-service/app-connection-service'
import { JwtSignAlgorithm, jwtUtils } from '../../helper/jwt-utils'
import { projectService } from '../../project/project-service'
import { appCredentialService } from '../app-credentials/app-credentials.service'
import { connectionKeyService } from './connection-key.service'

type VerifiedToken = {
    connectionName: string
}

// Verify a provisioning token against a workspace's registered connection-key public keys. The
// first key that validates wins; if none validate the token is rejected. The `sub` claim is the
// connection name.
async function verifyToken(log: FastifyBaseLogger, projectId: string, token: string): Promise<VerifiedToken> {
    const publicKeys = await connectionKeyService(log).listPublicKeysByProject({ projectId })
    for (const publicKey of publicKeys) {
        try {
            const payload = await jwtUtils.decodeAndVerify<{ sub?: string }>({
                jwt: token,
                key: publicKey,
                algorithm: JwtSignAlgorithm.RS256,
                issuer: null,
            })
            if (!isNil(payload.sub) && payload.sub !== '') {
                return { connectionName: payload.sub }
            }
        }
        catch (_error) {
            // Try the next registered key.
        }
    }
    throw new IntellisperError({
        code: ErrorCode.INVALID_BEARER_TOKEN,
        params: { message: 'Provisioning token did not validate against any workspace connection key.' },
    })
}

// The external id of a provisioned connection: stable per (integration, connection name), so
// re-provisioning the same named connection replaces it rather than duplicating.
function externalIdOf(appName: string, connectionName: string): string {
    return `${appName}_${connectionName}`
}

export const connectionKeyProvisioningService = (log: FastifyBaseLogger) => ({
    // Provision (upsert) an end-user connection from a signed token + an app-credential template.
    async upsertConnection(request: UpsertConnectionFromToken): Promise<AppConnectionWithoutSensitiveData> {
        const credential = await resolveCredentialAndVerify(log, request.appCredentialId, request.token)
        const platformId = await projectService(log).getPlatformId(credential.projectId)
        const externalId = externalIdOf(credential.appName, credential.connectionName)

        const base = {
            platformId,
            projectIds: [credential.projectId],
            scope: AppConnectionScope.PROJECT,
            ownerId: null,
            externalId,
            displayName: credential.connectionName,
            blockName: credential.appName,
            status: AppConnectionStatus.ACTIVE,
        }

        if (credential.settings.type === AppCredentialType.API_KEY) {
            if (!('apiKey' in request)) {
                throw invalidRequest('An API-key credential requires an apiKey.')
            }
            return appConnectionService(log).upsert({
                ...base,
                type: AppConnectionType.SECRET_TEXT,
                value: { type: AppConnectionType.SECRET_TEXT, secret_text: request.apiKey },
            })
        }

        // OAuth2: exchange the authorization code server-side using the template's client
        // credentials (the app-connection service's validation path performs the exchange).
        if (!('code' in request)) {
            throw invalidRequest('An OAuth2 credential requires an authorization code.')
        }
        const oauthSettings = credential.settings
        return appConnectionService(log).upsert({
            ...base,
            type: AppConnectionType.OAUTH2,
            value: {
                type: AppConnectionType.OAUTH2,
                client_id: oauthSettings.clientId,
                client_secret: oauthSettings.clientSecret ?? '',
                code: request.code,
                scope: oauthSettings.scope,
                redirect_url: request.redirectUrl,
                grant_type: oauthSettings.grantType ?? OAuth2GrantType.AUTHORIZATION_CODE,
                props: request.props,
            },
        })
    },

    // Read a provisioned connection by signed token (without its sensitive value).
    async getConnection(request: GetOrDeleteConnectionFromTokenRequest): Promise<AppConnectionWithoutSensitiveData | null> {
        const { connectionName } = await verifyToken(log, request.projectId, request.token)
        const platformId = await projectService(log).getPlatformId(request.projectId)
        const connection = await appConnectionService(log).getOne({
            projectId: request.projectId,
            platformId,
            externalId: externalIdOf(request.appName, connectionName),
        })
        return isNil(connection) ? null : appConnectionService(log).removeSensitiveData(connection)
    },

    // Delete a provisioned connection by signed token.
    async deleteConnection(request: GetOrDeleteConnectionFromTokenRequest): Promise<void> {
        const { connectionName } = await verifyToken(log, request.projectId, request.token)
        const platformId = await projectService(log).getPlatformId(request.projectId)
        const externalId = externalIdOf(request.appName, connectionName)
        const connection = await appConnectionService(log).getOne({
            projectId: request.projectId,
            platformId,
            externalId,
        })
        if (isNil(connection)) {
            return
        }
        await appConnectionService(log).delete({
            id: connection.id,
            platformId,
            projectId: request.projectId,
            scope: AppConnectionScope.PROJECT,
        })
    },
})

// Resolve the app-credential (workspace-scoped) and verify the provisioning token against that
// workspace's connection keys. Returns the credential enriched with the verified connection name.
async function resolveCredentialAndVerify(
    log: FastifyBaseLogger,
    appCredentialId: string,
    token: string,
): Promise<AppCredential & { connectionName: string }> {
    // The credential row carries the owning workspace; find it first (by id) to learn the project,
    // then verify the token against that workspace's keys.
    const credentialProjectId = await appCredentialService(log).findProjectId({ id: appCredentialId })
    if (isNil(credentialProjectId)) {
        throw new IntellisperError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityType: 'app_credential', entityId: appCredentialId },
        })
    }
    const { connectionName } = await verifyToken(log, credentialProjectId, token)
    const credential = await appCredentialService(log).getOneOrThrow({ id: appCredentialId, projectId: credentialProjectId })
    return { ...credential, connectionName }
}

function invalidRequest(message: string): IntellisperError {
    return new IntellisperError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}
