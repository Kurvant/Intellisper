// Clean-room implementation — SCIM 2.0 serialization + discovery (capability spec B.5). Maps the
// platform's domain records to the public SCIM 2.0 resource shapes an identity provider expects,
// and serves the protocol's service-discovery documents. Pure functions — no I/O.
import {
    Project,
    SCIM_GROUP_SCHEMA,
    SCIM_LIST_RESPONSE_SCHEMA,
    SCIM_RESOURCE_TYPE_SCHEMA,
    SCIM_SCHEMA_SCHEMA,
    SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA,
    SCIM_USER_SCHEMA,
    ScimGroupResource,
    ScimListResponse,
    ScimUserResource,
    UserStatus,
    UserWithMetaInformation,
} from '@intelblocks/shared'

// A SCIM User is a platform user: id = the platform user id, userName = the email, active =
// whether the user is ACTIVE, externalId = the IdP's stable id for the user.
export function toScimUser(user: UserWithMetaInformation): ScimUserResource {
    return {
        schemas: [SCIM_USER_SCHEMA],
        id: user.id,
        userName: user.email,
        name: {
            givenName: user.firstName,
            familyName: user.lastName,
            formatted: `${user.firstName} ${user.lastName}`.trim(),
        },
        emails: [{ value: user.email, primary: true, type: 'work' }],
        active: user.status === UserStatus.ACTIVE,
        ...(user.externalId ? { externalId: user.externalId } : {}),
        meta: {
            resourceType: 'User',
            created: toIso(user.created),
            lastModified: toIso(user.updated),
            location: `/api/v1/scim/v2/Users/${user.id}`,
        },
    }
}

// A SCIM Group is a TEAM workspace: id = the project id, displayName = the workspace name,
// members = the workspace members (each member's `value` is the platform user id).
export function toScimGroup(project: Project, memberUserIds: string[]): ScimGroupResource {
    return {
        schemas: [SCIM_GROUP_SCHEMA],
        id: project.id,
        displayName: project.displayName,
        members: memberUserIds.map((value) => ({ value })),
        ...(project.externalId ? { externalId: project.externalId } : {}),
        meta: {
            resourceType: 'Group',
            created: toIso(project.created),
            lastModified: toIso(project.updated),
            location: `/api/v1/scim/v2/Groups/${project.id}`,
        },
    }
}

// A SCIM ListResponse envelope around a page of already-serialized resources.
export function toScimListResponse(resources: unknown[], startIndex: number, itemsPerPage: number): ScimListResponse {
    return {
        schemas: [SCIM_LIST_RESPONSE_SCHEMA],
        totalResults: resources.length,
        startIndex,
        itemsPerPage,
        Resources: resources,
    }
}

// ServiceProviderConfig — advertises the protocol features this server supports (patch + filter,
// no bulk), per the SCIM 2.0 discovery contract.
export function serviceProviderConfig(): Record<string, unknown> {
    return {
        schemas: [SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA],
        documentationUri: 'https://datatracker.ietf.org/doc/html/rfc7644',
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [
            {
                type: 'oauthbearertoken',
                name: 'API Key',
                description: 'Authentication via an organization API key presented as a bearer token.',
                primary: true,
            },
        ],
        meta: { resourceType: 'ServiceProviderConfig', location: '/api/v1/scim/v2/ServiceProviderConfig' },
    }
}

// ResourceTypes — the resources this server manages (User, Group), as a ListResponse.
export function resourceTypes(): ScimListResponse {
    const resources = [
        {
            schemas: [SCIM_RESOURCE_TYPE_SCHEMA],
            id: 'User',
            name: 'User',
            endpoint: '/Users',
            schema: SCIM_USER_SCHEMA,
            meta: { resourceType: 'ResourceType', location: '/api/v1/scim/v2/ResourceTypes/User' },
        },
        {
            schemas: [SCIM_RESOURCE_TYPE_SCHEMA],
            id: 'Group',
            name: 'Group',
            endpoint: '/Groups',
            schema: SCIM_GROUP_SCHEMA,
            meta: { resourceType: 'ResourceType', location: '/api/v1/scim/v2/ResourceTypes/Group' },
        },
    ]
    return toScimListResponse(resources, 1, resources.length)
}

// Schemas — the attribute schemas for the managed resources, as a ListResponse.
export function schemas(): ScimListResponse {
    const resources = [
        {
            schemas: [SCIM_SCHEMA_SCHEMA],
            id: SCIM_USER_SCHEMA,
            name: 'User',
            description: 'User Account',
            attributes: [
                { name: 'userName', type: 'string', required: true, mutability: 'readWrite', uniqueness: 'server' },
                { name: 'name', type: 'complex', required: false, mutability: 'readWrite' },
                { name: 'emails', type: 'complex', multiValued: true, required: false, mutability: 'readWrite' },
                { name: 'active', type: 'boolean', required: false, mutability: 'readWrite' },
            ],
            meta: { resourceType: 'Schema', location: `/api/v1/scim/v2/Schemas/${SCIM_USER_SCHEMA}` },
        },
        {
            schemas: [SCIM_SCHEMA_SCHEMA],
            id: SCIM_GROUP_SCHEMA,
            name: 'Group',
            description: 'Group',
            attributes: [
                { name: 'displayName', type: 'string', required: true, mutability: 'readWrite' },
                { name: 'members', type: 'complex', multiValued: true, required: false, mutability: 'readWrite' },
            ],
            meta: { resourceType: 'Schema', location: `/api/v1/scim/v2/Schemas/${SCIM_GROUP_SCHEMA}` },
        },
    ]
    return toScimListResponse(resources, 1, resources.length)
}

function toIso(value: string | Date): string {
    return typeof value === 'string' ? value : value.toISOString()
}
