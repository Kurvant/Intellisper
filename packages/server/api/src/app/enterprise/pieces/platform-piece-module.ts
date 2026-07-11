// Clean-room implementation — organization-managed integration installation (capability spec
// I.1 "organization-private integrations").
//
// The enterprise editions (CLOUD / ENTERPRISE) do NOT register the community block module, so
// this module owns the `POST /v1/blocks` contract there: installing an organization-private
// ("custom") integration into the calling organization. Two package sources are accepted (spec
// I.1 / AddBlockRequestBody): a private ARCHIVE upload and a REGISTRY (npm) package, both scoped
// to the platform. The installed block is persisted as a CUSTOM block owned by the organization,
// which the private-visibility layer then exposes only to that organization.
//
// Authorization is ORGANIZATION-ADMINISTRATOR only (a non-admin user is rejected 403; a service
// principal acts for the organization) and is ALWAYS-ON (Part III) — installation is a core
// governance capability, not gated behind an entitlement flag. Tenant isolation: the block is
// always installed under the caller's own `principal.platform.id`, never an id from the request.
import { BlockMetadataModel } from '@intelblocks/blocks-framework'
import { AddBlockRequestBody, PrincipalType } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { blockInstallService } from '../../pieces/piece-install-service'

export const platformBlockModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(platformBlockController, { prefix: '/v1/blocks' })
}

const platformBlockController: FastifyPluginAsyncZod = async (app) => {
    // Install an organization-private block. Organization-administrator only; the block is
    // installed under the caller's own organization.
    app.post(
        '/',
        {
            config: {
                security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
            },
            schema: {
                body: AddBlockRequestBody,
            },
        },
        async (req, res): Promise<BlockMetadataModel> => {
            const platformId = req.principal.platform.id
            const blockMetadata = await blockInstallService(req.log).installBlock(
                platformId,
                req.body,
            )
            return res.code(StatusCodes.CREATED).send(blockMetadata)
        },
    )
}
