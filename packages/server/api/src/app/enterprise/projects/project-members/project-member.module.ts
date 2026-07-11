// Clean-room implementation — project (workspace) member administration API
// (capability spec C.2). Listing a project's members is available to any authenticated
// member of the project (used by the connections UI in every edition); changing a
// member's role or removing a member requires the WRITE_PROJECT_MEMBER permission on that
// project, enforced through the RBAC layer.
import {
    ListProjectMembersRequestQuery,
    Permission,
    PrincipalType,
    ProjectMemberWithUser,
    SeekPage,
    UpdateProjectMemberRoleRequestBody,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../../core/security/authorization/common'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { assertRoleHasPermission } from '../../authentication/project-role/rbac-middleware'
import { projectMemberService } from './project-member.service'

const DEFAULT_LIST_LIMIT = 100

export const projectMemberModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(projectMemberController, { prefix: '/v1/project-members' })
}

const projectMemberController: FastifyPluginAsyncZod = async (app) => {

    // List a project's members. Project-scoped: the caller must belong to the project
    // named in the query (cross-project reads are rejected by the project security guard).
    app.get('/', ListRequest, async (request): Promise<SeekPage<ProjectMemberWithUser>> => {
        return projectMemberService(request.log).list({
            platformId: request.principal.platform.id,
            projectId: request.query.projectId,
            projectRoleId: request.query.projectRoleId,
            cursorRequest: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIST_LIMIT,
        })
    })

    // Change a member's role. Requires WRITE_PROJECT_MEMBER on the member's project — a
    // caller outside the member's tenant is rejected by that authorization check (403).
    app.post('/:id', UpdateRequest, async (request) => {
        const member = await projectMemberService(request.log).getOneOrThrow({ id: request.params.id })
        await assertRoleHasPermission(request.principal, member.projectId, Permission.WRITE_PROJECT_MEMBER, request.log)
        return projectMemberService(request.log).updateRole({ member, roleName: request.body.role })
    })

    // Remove a member. Requires WRITE_PROJECT_MEMBER on the member's project.
    app.delete('/:id', DeleteRequest, async (request, reply) => {
        const member = await projectMemberService(request.log).getOneOrThrow({ id: request.params.id })
        await assertRoleHasPermission(request.principal, member.projectId, Permission.WRITE_PROJECT_MEMBER, request.log)
        await projectMemberService(request.log).deleteById({ id: request.params.id })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const ListRequest = {
    config: {
        security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], Permission.READ_PROJECT_MEMBER, {
            type: ProjectResourceType.QUERY,
        }),
    },
    schema: {
        querystring: ListProjectMembersRequestQuery,
    },
}

const UpdateRequest = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        params: z.object({ id: z.string() }),
        body: UpdateProjectMemberRoleRequestBody,
    },
}

const DeleteRequest = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        params: z.object({ id: z.string() }),
    },
}
