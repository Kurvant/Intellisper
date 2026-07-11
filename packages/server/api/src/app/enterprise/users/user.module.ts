// Clean-room implementation — enterprise user extensions (`/v1/users`, capability spec B —
// user/profile management). This module ADDS the user-facing profile routes on top of the core
// platform-user module (`user/platform/platform-user-module.ts`, which owns list / admin-update /
// admin-delete at the same prefix):
//
//   GET    /v1/users/:id               — fetch a single user, scoped to the caller's organization
//                                        (an unknown id, or a user on another organization, is 404).
//                                        Available to an interactive user and to a SERVICE (API-key)
//                                        principal acting for the organization.
//   DELETE /v1/users/me/profile-picture — the current user clears their own avatar.
//
// Registered in every edition alongside the core module (no route collides: the core module has no
// `GET /:id` and no `/me/profile-picture`). The two routes share the `/v1/users` prefix with the
// core controller; Fastify merges them.
import {
    IbId,
    PrincipalType,
    UserWithMetaInformation,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { userIdentityService } from '../../authentication/user-identity/user-identity-service'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { userService } from '../../user/user-service'

export const userModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(enterpriseUserController, { prefix: '/v1/users' })
}

const enterpriseUserController: FastifyPluginAsyncZod = async (app) => {

    // Clear the CURRENT user's profile picture (their own avatar on their identity). Any
    // authenticated organization user may act on themselves.
    app.delete('/me/profile-picture', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER]),
        },
    }, async (request): Promise<{ success: boolean }> => {
        const user = await userService(request.log).getOneOrFail({ id: request.principal.id })
        await userIdentityService(request.log).update(user.identityId, { imageUrl: null })
        return { success: true }
    })

    // Fetch a single user by id, scoped to the caller's organization. An unknown id or a user on a
    // different organization is not found (404). Available to an interactive user and to a SERVICE
    // (API-key) principal acting for the organization.
    app.get('/:id', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
        },
        schema: {
            params: z.object({ id: IbId }),
        },
    }, async (request): Promise<UserWithMetaInformation> => {
        return userService(request.log).getOneByIdAndPlatformIdOrThrow({
            id: request.params.id,
            platformId: request.principal.platform.id,
        })
    })
}
