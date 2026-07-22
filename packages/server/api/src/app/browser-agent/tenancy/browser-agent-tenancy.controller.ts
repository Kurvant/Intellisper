import {
    PrincipalType,
    ResolvePersonalPlatformCollisionRequest,
    ResolvePersonalPlatformCollisionResponse,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { userService } from '../../user/user-service'
import { browserAgentTenancyService } from './browser-agent-tenancy.service'

/**
 * Invite-collision resolution surface. The acting USER resolves their own identity from the
 * principal — the operation is strictly scoped to their own personal browser-agent workspace, so
 * no other account's data can be touched. Registered under `/api/v1/browser-agent/tenancy`.
 */
export const browserAgentTenancyController: FastifyPluginAsyncZod = async (app) => {
    app.post('/transfer-personal-platform', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
        schema: {
            tags: ['browser-agent'],
            description: 'Resolve a personal-platform invite collision: transfer, abandon, or decline.',
            body: ResolvePersonalPlatformCollisionRequest,
            response: {
                [StatusCodes.OK]: ResolvePersonalPlatformCollisionResponse,
            },
        },
    }, async (req, reply) => {
        const user = await userService(req.log).getOneOrFail({ id: req.principal.id })
        const result = await browserAgentTenancyService(req.log).resolvePersonalPlatformCollision({
            identityId: user.identityId,
            action: req.body.action,
            targetPlatformId: req.body.targetPlatformId,
        })
        await reply.status(StatusCodes.OK).send(result)
    })
}
