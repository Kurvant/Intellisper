// Clean-room implementation — SCIM 2.0 directory-provisioning API (`/v1/scim/v2`, capability spec
// B.5). Implements the public SCIM 2.0 protocol so an identity provider (Okta, Azure AD, …) can
// automatically provision and de-provision users and groups. Users map to platform users; groups
// map to TEAM workspaces (their members become workspace members). Includes the protocol's
// service-discovery documents (ServiceProviderConfig, ResourceTypes, Schemas).
//
// Authorization: every route is reachable ONLY by a SERVICE principal (the organization API key an
// IdP presents as a bearer token) — an interactive user or an unauthenticated caller is rejected
// 403. The whole feature is entitlement-gated on the SCIM plan flag: a platform without it gets
// 402 Payment Required. Registered in CLOUD / ENTERPRISE.
import {
    CreateScimGroupRequest,
    CreateScimUserRequest,
    PrincipalType,
    ReplaceScimGroupRequest,
    ReplaceScimUserRequest,
    ScimListQueryParams,
    ScimPatchRequest,
    ScimResourceId,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { platformMustHaveFeatureEnabledOrPaymentRequired } from '../authentication/ee-authorization'
import { resourceTypes, schemas, serviceProviderConfig, toScimListResponse } from './scim-common'
import { scimGroupService } from './scim-group-service'
import { scimUserService } from './scim-user-service'

export const scimModule: FastifyPluginAsyncZod = async (app) => {
    // Entitlement gate: SCIM is a plan feature (B.5). A platform whose plan lacks it → 402.
    app.addHook('preHandler', platformMustHaveFeatureEnabledOrPaymentRequired((platform) => platform.plan.scimEnabled))
    await app.register(scimController, { prefix: '/v1/scim/v2' })
}

// SCIM is IdP-to-server (machine) traffic: only a SERVICE principal (an organization API key) is
// allowed. A user or unauthenticated principal is rejected 403.
const serviceOnly = { config: { security: securityAccess.platformAdminOnly([PrincipalType.SERVICE]) } }

const scimController: FastifyPluginAsyncZod = async (app) => {

    // --- Discovery ---
    app.get('/ServiceProviderConfig', serviceOnly, async () => serviceProviderConfig())
    app.get('/ResourceTypes', serviceOnly, async () => resourceTypes())
    app.get('/Schemas', serviceOnly, async () => schemas())

    // --- Users ---
    app.post('/Users', {
        ...serviceOnly,
        schema: { body: CreateScimUserRequest },
    }, async (request, reply) => {
        const user = await scimUserService(request.log).create({
            platformId: request.principal.platform.id,
            request: request.body,
        })
        return reply.status(StatusCodes.CREATED).send(user)
    })

    app.get('/Users', {
        ...serviceOnly,
        schema: { querystring: ScimListQueryParams },
    }, async (request) => {
        const users = await scimUserService(request.log).list({
            platformId: request.principal.platform.id,
            filter: request.query.filter,
        })
        return toScimListResponse(users, request.query.startIndex ?? 1, users.length)
    })

    app.get('/Users/:id', {
        ...serviceOnly,
        schema: { params: ScimResourceId },
    }, async (request) => {
        return scimUserService(request.log).getOne({
            platformId: request.principal.platform.id,
            id: request.params.id,
        })
    })

    app.patch('/Users/:id', {
        ...serviceOnly,
        schema: { params: ScimResourceId, body: ScimPatchRequest },
    }, async (request) => {
        return scimUserService(request.log).patch({
            platformId: request.principal.platform.id,
            id: request.params.id,
            request: request.body,
        })
    })

    app.put('/Users/:id', {
        ...serviceOnly,
        schema: { params: ScimResourceId, body: ReplaceScimUserRequest },
    }, async (request) => {
        return scimUserService(request.log).replace({
            platformId: request.principal.platform.id,
            id: request.params.id,
            request: request.body,
        })
    })

    app.delete('/Users/:id', {
        ...serviceOnly,
        schema: { params: ScimResourceId },
    }, async (request, reply) => {
        await scimUserService(request.log).deactivate({
            platformId: request.principal.platform.id,
            id: request.params.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    // --- Groups (as TEAM workspaces) ---
    app.post('/Groups', {
        ...serviceOnly,
        schema: { body: CreateScimGroupRequest },
    }, async (request, reply) => {
        const group = await scimGroupService(request.log).create({
            platformId: request.principal.platform.id,
            request: request.body,
        })
        return reply.status(StatusCodes.CREATED).send(group)
    })

    app.get('/Groups', {
        ...serviceOnly,
        schema: { querystring: ScimListQueryParams },
    }, async (request) => {
        const groups = await scimGroupService(request.log).list({
            platformId: request.principal.platform.id,
        })
        return toScimListResponse(groups, request.query.startIndex ?? 1, groups.length)
    })

    app.get('/Groups/:id', {
        ...serviceOnly,
        schema: { params: ScimResourceId },
    }, async (request) => {
        return scimGroupService(request.log).getOne({
            platformId: request.principal.platform.id,
            id: request.params.id,
        })
    })

    app.patch('/Groups/:id', {
        ...serviceOnly,
        schema: { params: ScimResourceId, body: ScimPatchRequest },
    }, async (request) => {
        return scimGroupService(request.log).patch({
            platformId: request.principal.platform.id,
            id: request.params.id,
            request: request.body,
        })
    })

    app.put('/Groups/:id', {
        ...serviceOnly,
        schema: { params: ScimResourceId, body: ReplaceScimGroupRequest },
    }, async (request) => {
        return scimGroupService(request.log).replace({
            platformId: request.principal.platform.id,
            id: request.params.id,
            request: request.body,
        })
    })

    app.delete('/Groups/:id', {
        ...serviceOnly,
        schema: { params: ScimResourceId },
    }, async (request, reply) => {
        await scimGroupService(request.log).delete({
            platformId: request.principal.platform.id,
            id: request.params.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}
