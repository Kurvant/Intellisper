// Clean-room implementation — SCIM 2.0 User provisioning (capability spec B.5). Maps the public
// SCIM User resource onto the platform's user + identity records so an identity provider can
// create, read, update, activate/deactivate, and de-provision users automatically.
//
// A SCIM User is a platform user keyed by (platform, externalId); its `active` flag is the user's
// ACTIVE/INACTIVE status. Provisioning is idempotent by external id: creating a user the IdP has
// seen before returns/updates the existing record rather than duplicating. De-provisioning
// (DELETE) DEACTIVATES rather than hard-deletes — the standard SCIM offboarding semantics — so the
// user's history is retained and the account can be reactivated.
import {
    CreateScimUserRequest,
    ErrorCode,
    ibId,
    IntellisperError,
    isNil,
    parseScimFilter,
    PlatformRole,
    ReplaceScimUserRequest,
    ScimPatchRequest,
    ScimUserResource,
    UserIdentity,
    UserIdentityProvider,
    UserStatus,
    UserWithMetaInformation,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../../authentication/user-identity/user-identity-service'
import { userService } from '../../user/user-service'
import { toScimUser } from './scim-common'

export const scimUserService = (log: FastifyBaseLogger) => ({
    // Provision a user from the IdP. Idempotent per (platform, externalId): a returning user is
    // reconciled (name/active refreshed) rather than duplicated. The identity is provisioned via
    // the JWT provider and marked verified (the IdP vouched for it).
    async create({ platformId, request }: { platformId: string, request: CreateScimUserRequest }): Promise<ScimUserResource> {
        const active = request.active ?? true
        const email = request.userName.toLowerCase().trim()

        if (!isNil(request.externalId)) {
            const existing = await userService(log).getByPlatformAndExternalId({ platformId, externalId: request.externalId })
            if (!isNil(existing)) {
                const reconciled = await userService(log).update({
                    id: existing.id,
                    platformId,
                    status: active ? UserStatus.ACTIVE : UserStatus.INACTIVE,
                })
                return toScimUser(reconciled)
            }
        }

        const identity = await getOrCreateIdentity(log, {
            email,
            firstName: request.name?.givenName ?? '',
            lastName: request.name?.familyName ?? '',
        })
        const platformRole = request[
            'urn:ietf:params:scim:schemas:intellisper:1.0:CustomUserAttributes'
        ]?.platformRole ?? PlatformRole.MEMBER
        const user = await userService(log).create({
            identityId: identity.id,
            platformId,
            platformRole,
            externalId: request.externalId,
            isActive: active,
        })
        return toScimUser(await userService(log).getMetaInformation({ id: user.id }))
    },

    // A single provisioned user by id, scoped to the organization.
    async getOne({ platformId, id }: { platformId: string, id: string }): Promise<ScimUserResource> {
        const user = await getScopedUserOrThrow(log, platformId, id)
        return toScimUser(user)
    },

    // List the organization's users, optionally filtered by `userName eq "..."` (the filter an IdP
    // uses to check whether a user already exists before creating).
    async list({ platformId, filter }: { platformId: string, filter: string | undefined }): Promise<ScimUserResource[]> {
        const userNameFilter = parseScimFilter(filter, 'userName')
        const page = await userService(log).list({ platformId, cursorRequest: null, limit: 1000 })
        const users = isNil(userNameFilter)
            ? page.data
            : page.data.filter((user) => user.email.toLowerCase() === userNameFilter)
        return users.map(toScimUser)
    },

    // Apply a SCIM PATCH — the IdP's incremental update, used almost exclusively to toggle `active`
    // (activation / deactivation). An operation replacing `active` sets the user's status.
    async patch({ platformId, id, request }: { platformId: string, id: string, request: ScimPatchRequest }): Promise<ScimUserResource> {
        const user = await getScopedUserOrThrow(log, platformId, id)
        let nextStatus = user.status
        for (const operation of request.Operations) {
            const active = extractActive(operation.value, operation.path)
            if (!isNil(active)) {
                nextStatus = active ? UserStatus.ACTIVE : UserStatus.INACTIVE
            }
        }
        if (nextStatus !== user.status) {
            await userService(log).update({ id, platformId, status: nextStatus })
        }
        return toScimUser(await userService(log).getMetaInformation({ id }))
    },

    // Replace a user (PUT) — a full re-assertion of the resource from the IdP. Applies the new
    // active state (name is identity-level and left as-is; SCIM PUT for a managed user primarily
    // carries activation state).
    async replace({ platformId, id, request }: { platformId: string, id: string, request: ReplaceScimUserRequest }): Promise<ScimUserResource> {
        await getScopedUserOrThrow(log, platformId, id)
        const active = request.active ?? true
        await userService(log).update({ id, platformId, status: active ? UserStatus.ACTIVE : UserStatus.INACTIVE })
        return toScimUser(await userService(log).getMetaInformation({ id }))
    },

    // De-provision (DELETE) — SCIM offboarding DEACTIVATES the user rather than hard-deleting, so
    // history is retained and the account can be reactivated later.
    async deactivate({ platformId, id }: { platformId: string, id: string }): Promise<void> {
        await getScopedUserOrThrow(log, platformId, id)
        await userService(log).update({ id, platformId, status: UserStatus.INACTIVE })
    },
})

// Resolve a user by id, asserting it belongs to the calling organization (404 otherwise).
async function getScopedUserOrThrow(log: FastifyBaseLogger, platformId: string, id: string): Promise<UserWithMetaInformation> {
    const user = await userService(log).getMetaInformation({ id }).catch(() => undefined)
    if (isNil(user) || user.platformId !== platformId) {
        throw new IntellisperError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityType: 'user', entityId: id },
        })
    }
    return user
}

// Reuse an existing identity for the email if one exists (a person may already have an account),
// otherwise create a JWT-provider verified identity for the managed user.
async function getOrCreateIdentity(log: FastifyBaseLogger, params: { email: string, firstName: string, lastName: string }): Promise<UserIdentity> {
    const existing = await userIdentityService(log).getIdentityByEmail(params.email).catch(() => null)
    if (!isNil(existing)) {
        return existing
    }
    return userIdentityService(log).create({
        email: params.email,
        password: ibId(),
        firstName: params.firstName,
        lastName: params.lastName,
        trackEvents: true,
        newsLetter: false,
        provider: UserIdentityProvider.JWT,
        verified: true,
    })
}

// Read the `active` boolean from a PATCH operation, whether expressed as `{value:{active}}` (no
// path) or `path: 'active', value: <bool>`.
function extractActive(value: unknown, path: string | undefined): boolean | undefined {
    if (path === 'active') {
        return coerceBoolean(value)
    }
    if (typeof value === 'object' && value !== null && 'active' in value) {
        return coerceBoolean((value as { active: unknown }).active)
    }
    return undefined
}

function coerceBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
        return value
    }
    if (value === 'true') {
        return true
    }
    if (value === 'false') {
        return false
    }
    return undefined
}
