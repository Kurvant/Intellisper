import {
    ListAgentRunsRequest,
    ListAgentRunsResponse,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { browserAgentActivity } from './browser-agent-activity.service'

/**
 * Tier 1 — the acting USER's own agent runs (the "my activity" list). Strictly owner-scoped: the
 * service reads via `agentScope.ownerFilter`, so a user only ever sees their own runs on their own
 * platform. projectId (from the query) is validated for membership by the guard.
 */
export const browserAgentRunController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'List the acting user\'s agent runs (status, steps, tokens, timing), paginated, optionally filtered by status.',
            querystring: ListAgentRunsRequest,
            response: { [StatusCodes.OK]: ListAgentRunsResponse },
        },
    }, async (request, reply) => {
        const scope = { userId: request.principal.id, platformId: request.principal.platform.id }
        const result = await browserAgentActivity(request.log).listUserRuns(scope, {
            status: request.query.status,
            page: request.query.page,
            limit: request.query.limit,
        })
        await reply.status(StatusCodes.OK).send(result)
    })
}
