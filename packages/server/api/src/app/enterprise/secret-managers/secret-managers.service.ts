// Clean-room implementation — external secret-store integration (capability spec E.6).
//
// COMMUNITY-CRITICAL: `resolveObject`/`resolveString`/`containsSecretManagerReference` run in
// EVERY edition on connection create/use/refresh. A value that contains NO reference MUST be
// returned unchanged (a non-reference is a literal, never an error). Only a well-formed
// reference to an in-scope, same-organization store is resolved to its live value.
//
// Reference grammar (public contract): `{{ <connectionId><separator><path> }}` where the id
// and path split on the FIRST separator (SecretManagerFieldsSeparator). Resolution:
//   - walks the input recursively, substituting each embedded reference with the live value;
//   - resolves under the executing workspace's scope, re-checking on every retrieval that the
//     store belongs to the caller's organization AND is in-scope for the workspace (fail-safe
//     deny on mismatch, per I.3 Guarantee A);
//   - a string that is NOT a well-formed reference is passed through unchanged;
//   - failure policy is per-call: strict (throwOnFailure true, the default) raises a typed
//     error; lenient (false) returns the original value.
//
// Config CRUD is exposed for the admin module: the provider connection is exercised LIVE
// before persistence (never store an unreachable/unauthorized config), credentials are
// encrypted at rest, and health/value caches are invalidated on every change. Cached secret
// values are encrypted in the cache; a successful health check is cached asymmetrically.
import {
    applyFunctionToValues,
    applyFunctionToValuesSync,
    ConnectSecretManagerRequest,
    ErrorCode,
    ibId,
    IntellisperError,
    isNil,
    SecretManagerConnection,
    SecretManagerConnectionScope,
    SecretManagerConnectionWithStatus,
    SecretManagerFieldsSeparator,
    SecretManagerProviderConfig,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { encryptUtils } from '../../helper/encryption'
import { secretManagerCache } from './secret-manager-cache'
import { getSecretManagerProvider } from './secret-manager-providers'
import { SecretManagerEntity, SecretManagerSchema } from './secret-manager.entity'

const secretManagerRepo = repoFactory(SecretManagerEntity)

const REFERENCE_PATTERN = /^\{\{(.+)\}\}$/

type ParsedReference = {
    connectionId: string
    path: string
}

// Parse a value into a secret reference, or null when it is not a well-formed reference (a
// literal). A `{{...}}` wrapper without a separator is NOT a reference — it is a literal.
function parseReference(value: unknown): ParsedReference | null {
    if (typeof value !== 'string') {
        return null
    }
    const match = value.match(REFERENCE_PATTERN)
    if (isNil(match)) {
        return null
    }
    const inner = match[1]
    const separatorIndex = inner.indexOf(SecretManagerFieldsSeparator)
    if (separatorIndex < 0) {
        return null
    }
    const connectionId = inner.slice(0, separatorIndex)
    const path = inner.slice(separatorIndex + SecretManagerFieldsSeparator.length)
    if (connectionId.length === 0 || path.length === 0) {
        return null
    }
    return { connectionId, path }
}

// True when the (possibly nested) value contains at least one well-formed secret reference.
export function containsSecretManagerReference(value: unknown): boolean {
    let found = false
    applyFunctionToValuesSync(value, (leaf) => {
        if (!found && !isNil(parseReference(leaf))) {
            found = true
        }
        return leaf
    })
    return found
}

// Resolve a single reference to its live secret value, enforcing tenant + workspace scope and
// using the encrypted distributed cache. Raises a typed error on genuine failure.
async function resolveReference(reference: ParsedReference, params: ResolveScope, log: FastifyBaseLogger): Promise<string> {
    const connection = await secretManagerRepo().findOneBy({
        id: reference.connectionId,
        platformId: params.platformId,
    })
    // Fail-safe deny: the store must belong to the caller's organization AND be in-scope for
    // the executing workspace (organization-wide, or workspace-scoped listing this workspace).
    if (isNil(connection) || !isConnectionInScope(connection, params.projectIds)) {
        throw new IntellisperError({
            code: ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED,
            params: {
                provider: 'unknown',
                message: 'Secret manager connection is not accessible in this scope.',
                request: { connectionId: reference.connectionId },
            },
        })
    }

    const cached = await secretManagerCache.getValue({
        platformId: params.platformId,
        connectionId: connection.id,
        path: reference.path,
    })
    if (!isNil(cached)) {
        return cached
    }

    const provider = getSecretManagerProvider(connection.providerId)
    const config = await decryptConfig(connection)
    const session = await provider.connect({ config, log })
    try {
        const value = await provider.getSecret({ path: reference.path, session, config, log })
        await secretManagerCache.setValue({
            platformId: params.platformId,
            connectionId: connection.id,
            path: reference.path,
            value,
        })
        return value
    }
    finally {
        await provider.disconnect({ session, config, log }).catch(() => undefined)
    }
}

function isConnectionInScope(connection: SecretManagerSchema, projectIds: string[] | undefined): boolean {
    if (connection.scope === SecretManagerConnectionScope.PLATFORM) {
        return true
    }
    // Workspace-scoped: in scope only for the workspaces it explicitly lists. When the caller
    // has no workspace context, a workspace-scoped store is out of scope (fail-safe).
    if (isNil(projectIds) || projectIds.length === 0) {
        return false
    }
    const allowed = connection.projectIds ?? []
    return projectIds.some((projectId) => allowed.includes(projectId))
}

async function decryptConfig(connection: SecretManagerSchema): Promise<SecretManagerProviderConfig> {
    if (isNil(connection.auth)) {
        throw new IntellisperError({
            code: ErrorCode.SECRET_MANAGER_CONNECTION_FAILED,
            params: {
                provider: connection.providerId,
                message: 'Secret manager connection has no stored configuration.',
            },
        })
    }
    return encryptUtils.decryptObject<SecretManagerProviderConfig>(connection.auth)
}

function toConnectionDto(connection: SecretManagerSchema): SecretManagerConnection {
    if (connection.scope === SecretManagerConnectionScope.PROJECT) {
        return {
            id: connection.id,
            created: connection.created,
            updated: connection.updated,
            platformId: connection.platformId,
            providerId: connection.providerId,
            name: connection.name,
            scope: SecretManagerConnectionScope.PROJECT,
            projectIds: connection.projectIds ?? [],
        }
    }
    return {
        id: connection.id,
        created: connection.created,
        updated: connection.updated,
        platformId: connection.platformId,
        providerId: connection.providerId,
        name: connection.name,
        scope: SecretManagerConnectionScope.PLATFORM,
    }
}

export const secretManagersService = (log: FastifyBaseLogger) => ({

    // Recursively substitute every embedded reference in a value with its live secret value.
    // A value with no references is returned unchanged.
    async resolveObject<T>(params: ResolveObjectParams<T>): Promise<T> {
        return applyFunctionToValues<T>(params.value, (leaf) =>
            this.resolveString({ key: leaf, platformId: params.platformId, projectIds: params.projectIds, throwOnFailure: params.throwOnFailure ?? true }),
        )
    },

    // Resolve a single string. A non-reference is returned unchanged. A reference is resolved
    // under the workspace scope; on genuine failure the per-call policy applies.
    async resolveString(params: ResolveStringParams): Promise<string> {
        if (typeof params.key !== 'string') {
            return params.key
        }
        const reference = parseReference(params.key)
        if (isNil(reference)) {
            // Not a secret reference (or a malformed `{{...}}`): pass through as a literal.
            return params.key
        }
        const throwOnFailure = params.throwOnFailure ?? true
        try {
            return await resolveReference(reference, { platformId: params.platformId, projectIds: params.projectIds }, log)
        }
        catch (error) {
            if (throwOnFailure) {
                throw error
            }
            // Lenient: return the original value on failure.
            return params.key
        }
    },

    // List a platform's configured stores (never their credentials) with a configured/connected
    // status pair. Optionally narrowed to the stores usable by a given workspace (organization-
    // wide plus workspace-scoped stores that list it).
    async list(params: ListParams): Promise<SecretManagerConnectionWithStatus[]> {
        const connections = await secretManagerRepo().findBy({ platformId: params.platformId })
        const projectId = params.projectId
        const visible = isNil(projectId)
            ? connections
            : connections.filter((connection) => isConnectionInScope(connection, [projectId]))
        return Promise.all(visible.map((connection) => this.toConnectionWithStatus(connection)))
    },

    async toConnectionWithStatus(connection: SecretManagerSchema): Promise<SecretManagerConnectionWithStatus> {
        const configured = !isNil(connection.auth)
        const connected = configured && await this.checkHealth(connection)
        return {
            ...toConnectionDto(connection),
            connection: { configured, connected },
        } as SecretManagerConnectionWithStatus
    },

    // A store's health: a cached success is honored; otherwise a live check is run and, on
    // success only, cached (asymmetric — a failure is never cached).
    async checkHealth(connection: SecretManagerSchema): Promise<boolean> {
        const cached = await secretManagerCache.getHealth({ platformId: connection.platformId, connectionId: connection.id })
        if (cached === true) {
            return true
        }
        try {
            const provider = getSecretManagerProvider(connection.providerId)
            const config = await decryptConfig(connection)
            const healthy = await provider.checkConnection({ config, log })
            if (healthy) {
                await secretManagerCache.setHealthy({ platformId: connection.platformId, connectionId: connection.id })
            }
            return healthy
        }
        catch (error) {
            log.debug({ error, connectionId: connection.id }, '[SecretManagers] health check failed')
            return false
        }
    },

    async getOneOrThrow(params: { id: string, platformId: string }): Promise<SecretManagerSchema> {
        const connection = await secretManagerRepo().findOneBy({ id: params.id, platformId: params.platformId })
        if (isNil(connection)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'secret_manager', entityId: params.id },
            })
        }
        return connection
    },

    // Configure a store: exercise the connection LIVE, then persist with the config encrypted
    // at rest. Invalidates the platform cache so no stale health/value survives the change.
    async create(params: CreateParams): Promise<SecretManagerConnection> {
        const { request, platformId } = params
        const provider = getSecretManagerProvider(request.providerId)

        // Live validation before persistence — reject an unreachable/unauthorized config.
        const session = await provider.connect({ config: request.config, log })
        await provider.disconnect({ session, config: request.config, log }).catch(() => undefined)

        const scope = request.scope
        const projectIds = scope === SecretManagerConnectionScope.PROJECT ? request.projectIds ?? [] : null

        const encryptedAuth = await encryptUtils.encryptObject(request.config)
        const saved = await secretManagerRepo().save({
            id: ibId(),
            platformId,
            providerId: request.providerId,
            name: request.name,
            scope,
            projectIds,
            auth: encryptedAuth,
        })

        await secretManagerCache.invalidateConnectionEntries({ platformId })
        return toConnectionDto(saved)
    },

    async delete(params: { id: string, platformId: string }): Promise<SecretManagerConnection> {
        const connection = await this.getOneOrThrow(params)
        await secretManagerRepo().delete({ id: connection.id, platformId: params.platformId })
        await secretManagerCache.invalidateConnectionEntries({ platformId: params.platformId, connectionId: connection.id })
        await secretManagerCache.invalidateConnectionEntries({ platformId: params.platformId })
        return toConnectionDto(connection)
    },

    // Clear cached entries for a platform (optionally one connection). Exposed to admin/service
    // principals via the module.
    async clearCache(params: { platformId: string, connectionId?: string }): Promise<void> {
        await secretManagerCache.invalidateConnectionEntries(params)
    },
})

type ResolveScope = {
    platformId: string
    projectIds: string[] | undefined
}

type ResolveObjectParams<T> = {
    value: T
    platformId: string
    projectIds: string[] | undefined
    throwOnFailure?: boolean
}

type ResolveStringParams = {
    key: string
    platformId: string
    projectIds?: string[] | undefined
    throwOnFailure?: boolean
}

type ListParams = {
    platformId: string
    projectId?: string
}

type CreateParams = {
    request: ConnectSecretManagerRequest
    platformId: string
}
