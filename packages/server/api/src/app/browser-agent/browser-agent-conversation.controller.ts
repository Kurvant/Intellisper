import {
    DeleteConversationRequest,
    ListConversationMessagesRequest,
    ListConversationMessagesResponse,
    ListConversationsRequest,
    ListConversationsResponse,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { browserAgentConversation } from './browser-agent-conversation.service'

/**
 * Conversation management surface — strictly user-private history browsing for the extension. Every
 * operation resolves the acting user from the principal and the conversation service scopes by
 * (platformId, userId) via agentScope; no admin path and no sharing branch, so a project member can
 * never list or read another member's conversations.
 */
export const browserAgentConversationController: FastifyPluginAsyncZod = async (app) => {
    app.get('/conversations', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'List the acting user\'s conversations (non-deleted, newest activity first, paginated).',
            querystring: ListConversationsRequest,
            response: { [StatusCodes.OK]: ListConversationsResponse },
        },
    }, async (request, reply) => {
        const scope = { userId: request.principal.id, platformId: request.principal.platform.id }
        const result = await browserAgentConversation(request.log).list(scope, { page: request.query.page, limit: request.query.limit })
        await reply.status(StatusCodes.OK).send(result)
    })

    app.get('/conversations/:id/messages', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'List one conversation\'s messages (oldest first, paginated). Ownership is verified first.',
            params: z.object({ id: z.string() }),
            querystring: ListConversationMessagesRequest,
            response: { [StatusCodes.OK]: ListConversationMessagesResponse },
        },
    }, async (request, reply) => {
        const scope = { userId: request.principal.id, platformId: request.principal.platform.id }
        const result = await browserAgentConversation(request.log).messages(scope, request.params.id, { page: request.query.page, limit: request.query.limit })
        await reply.status(StatusCodes.OK).send(result)
    })

    app.delete('/conversations/:id', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Soft-delete one of the acting user\'s conversations.',
            params: z.object({ id: z.string() }),
            querystring: DeleteConversationRequest,
            response: { [StatusCodes.OK]: z.object({ ok: z.boolean() }) },
        },
    }, async (request, reply) => {
        const scope = { userId: request.principal.id, platformId: request.principal.platform.id }
        const result = await browserAgentConversation(request.log).remove(scope, request.params.id)
        await reply.status(StatusCodes.OK).send(result)
    })
}
