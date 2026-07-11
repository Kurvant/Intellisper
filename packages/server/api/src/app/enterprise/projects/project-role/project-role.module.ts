// Clean-room implementation — custom project-role administration API (capability spec
// C.3). The create/update/delete surface is restricted to the organization owner; listing
// is available to any authenticated platform user. Availability of custom roles is
// entitlement-gated at the platform level (plan flags); this module always enforces the
// correct authorization and CRUD behavior regardless.
import { ApplicationEventName, CreateProjectRoleRequestBody, PrincipalType, ProjectRole, SeekPage, UpdateProjectRoleRequestBody } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../../helper/application-events'
import { platformMustBeOwnedByCurrentUser } from '../../authentication/ee-authorization'
import { projectRoleService } from './project-role.service'

export const projectRoleModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(projectRoleController, { prefix: '/v1/project-roles' })
}

const projectRoleController: FastifyPluginAsyncZod = async (app) => {

    app.post('/', CreateRequest, async (request, reply) => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        const role = await projectRoleService.create({
            platformId: request.principal.platform.id,
            request: request.body,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.PROJECT_ROLE_CREATED,
            data: { projectRole: role },
        })
        return reply.status(StatusCodes.CREATED).send(role)
    })

    app.get('/', ListRequest, async (request) => {
        return projectRoleService.list({ platformId: request.principal.platform.id })
    })

    app.post('/:id', UpdateRequest, async (request, reply) => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        const role = await projectRoleService.update({
            id: request.params.id,
            platformId: request.principal.platform.id,
            request: request.body,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.PROJECT_ROLE_UPDATED,
            data: { projectRole: role },
        })
        return role
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        await platformMustBeOwnedByCurrentUser.call(app, request, reply)
        const role = await projectRoleService.delete({
            idOrName: request.params.id,
            platformId: request.principal.platform.id,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.PROJECT_ROLE_DELETED,
            data: { projectRole: role },
        })
        return reply.status(StatusCodes.OK).send()
    })
}

const platformUser = { config: { security: securityAccess.publicPlatform([PrincipalType.USER]) } }

const CreateRequest = {
    ...platformUser,
    schema: {
        body: CreateProjectRoleRequestBody,
        response: { [StatusCodes.CREATED]: ProjectRole },
    },
}

const ListRequest = {
    ...platformUser,
    schema: {
        response: { [StatusCodes.OK]: SeekPage(ProjectRole) },
    },
}

const UpdateRequest = {
    ...platformUser,
    schema: {
        params: z.object({ id: z.string() }),
        body: UpdateProjectRoleRequestBody,
        response: { [StatusCodes.OK]: ProjectRole },
    },
}

const DeleteRequest = {
    ...platformUser,
    schema: {
        params: z.object({ id: z.string() }),
    },
}
