import { BlockMetadataModel } from '@intelblocks/blocks-framework'
import { AddBlockRequestBody, PrincipalType } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { blockInstallService } from './piece-install-service'

export const communityBlocksModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(communityBlocksController, { prefix: '/v1/blocks' })
}

const communityBlocksController: FastifyPluginAsyncZod = async (app) => {
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
