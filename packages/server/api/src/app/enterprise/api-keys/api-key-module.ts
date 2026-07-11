// Clean-room implementation — management API credentials (/v1/api-keys, capability spec F.1).
//
// Issuable organization-scoped credentials granting programmatic access to the management
// interface. Create, list, and delete are ORGANIZATION-ADMINISTRATOR only (a non-admin user is
// rejected 403; a service principal acts on behalf of the organization) and gated on the
// management-API-credential entitlement. All operations are tenant-scoped by organization.
//
// Create returns the full record INCLUDING the one-time clear value; list returns records
// WITHOUT the secret and WITHOUT its hash (only display name, truncated tail, last-used, and
// timestamps). Revocation is by deletion and takes effect immediately (the next authentication
// with that key fails); the platform never holds the clear secret.
import {
    ApiKeyResponseWithoutValue,
    ApiKeyResponseWithValue,
    CreateApiKeyRequest,
    PrincipalType,
    SeekPage,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { platformMustHaveFeatureEnabled } from '../authentication/ee-authorization'
import { apiKeyService } from './api-key-service'

export const apiKeyModule: FastifyPluginAsyncZod = async (app) => {
    // Gate the whole feature on the platform plan's management-API-credential entitlement.
    app.addHook('preHandler', platformMustHaveFeatureEnabled((platform) => platform.plan.apiKeysEnabled))
    await app.register(apiKeyController, { prefix: '/v1/api-keys' })
}

// All operations are organization-administrator only (spec F.1). A non-admin user is rejected
// (403) by the security layer; a service principal acts for the organization and is allowed.
const adminOnly = { config: { security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]) } }

const apiKeyController: FastifyPluginAsyncZod = async (app) => {

    // Issue a new API key. Returns the record with the one-time clear value.
    app.post('/', {
        ...adminOnly,
        schema: { body: CreateApiKeyRequest },
    }, async (request, reply): Promise<ApiKeyResponseWithValue> => {
        const apiKey = await apiKeyService.add({
            platformId: request.principal.platform.id,
            displayName: request.body.displayName,
        })
        return reply.status(StatusCodes.CREATED).send(apiKey)
    })

    // List the organization's API keys — non-secret metadata only (no secret, no hash).
    app.get('/', adminOnly, async (request): Promise<SeekPage<ApiKeyResponseWithoutValue>> => {
        const page = await apiKeyService.list({ platformId: request.principal.platform.id })
        return {
            ...page,
            data: page.data.map(({ hashedValue: _hashedValue, ...rest }) => rest),
        }
    })

    // Revoke (delete) an API key — takes effect immediately, tenant-scoped to the organization.
    app.delete('/:id', {
        ...adminOnly,
        schema: { params: z.object({ id: z.string() }) },
    }, async (request, reply): Promise<void> => {
        await apiKeyService.delete({
            platformId: request.principal.platform.id,
            id: request.params.id,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}
