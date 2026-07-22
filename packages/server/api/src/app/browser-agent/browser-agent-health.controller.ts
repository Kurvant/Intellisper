import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'

/**
 * Phase-0 skeleton controller. Proves the browser-agent module registers and its routes resolve
 * under `/api/v1/browser-agent/*`. The `ping` route also returns the negotiated protocol version
 * so the extension can confirm the backend speaks its contract (additive-only event schema; see
 * IMPLEMENTATION_PLAN.md §8). Real surfaces (chat/runs/memory/routines/…) replace this in later
 * phases.
 */
export const BROWSER_AGENT_PROTOCOL_VERSION = 1

export const browserAgentHealthController: FastifyPluginAsyncZod = async (app) => {
    app.get('/ping', {
        config: {
            security: securityAccess.public(),
        },
        schema: {
            tags: ['browser-agent'],
            description: 'Liveness + protocol-version handshake for the browser agent backend',
            response: {
                [StatusCodes.OK]: z.object({
                    status: z.literal('ok'),
                    protocolVersion: z.number(),
                }),
            },
        },
    }, async (_request, reply) => {
        await reply.status(StatusCodes.OK).send({ status: 'ok', protocolVersion: BROWSER_AGENT_PROTOCOL_VERSION })
    })
}
