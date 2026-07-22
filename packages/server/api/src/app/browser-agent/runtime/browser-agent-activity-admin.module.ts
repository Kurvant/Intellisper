// Tier 3 — the OPERATOR (Intellisper company) cross-tenant agent-activity surface. ENDPOINT ONLY —
// there is deliberately no web UI for this (a browser cannot hold the operator key).
//
// It aggregates agent activity ACROSS ALL TENANTS (grouped by platformId), so it belongs ONLY to the
// company running the install. It is built to the exact access model of the AI-gateway operator surface
// (`ai-gateway/ai-gateway-admin.module.ts`) and the super-admin platform surface:
//
//   1. Gated by the OPERATOR KEY (`AppSystemProp.API_KEY`) in a request header, deny-by-default.
//   2. Routes are `public()` — the header check is the whole gate, so NO tenant principal (JWT) can
//      reach it.
//   3. Registered ONLY under IbEdition.CLOUD (see app.ts). On a self-hosted single-tenant install a
//      cross-tenant view is meaningless and the surface simply never mounts (404).
import { AgentOperatorActivityRequest, AgentOperatorActivityResponse, IbEdition, isNil } from '@intelblocks/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { browserAgentActivity } from './browser-agent-activity.service'

const OPERATOR_KEY_HEADER = 'api-key'

/**
 * Two independent checks, either of which alone denies:
 *   1. Edition MUST be CLOUD (defense-in-depth: even a mis-registration can't expose cross-tenant data
 *      on a self-hosted install).
 *   2. The operator key MUST match. Deny-by-default: an unset key means CLOSED, never open.
 * The gate is a header secret, so there is no id/URL a tenant can tamper with to pass it.
 */
export async function assertOperator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const configuredKey = system.get(AppSystemProp.API_KEY)
    const presentedKey = request.headers[OPERATOR_KEY_HEADER] as string | undefined
    const denied = system.getEdition() !== IbEdition.CLOUD || isNil(configuredKey) || presentedKey !== configuredKey
    if (denied) {
        await reply.status(StatusCodes.FORBIDDEN).send({ message: 'Forbidden' })
        throw new Error('Forbidden')
    }
}

export const browserAgentActivityAdminModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preHandler', assertOperator)
    await app.register(browserAgentActivityAdminController, { prefix: '/v1/admin/browser-agent' })
}

const browserAgentActivityAdminController: FastifyPluginAsyncZod = async (app) => {
    // Public per-route: the operator-key preHandler is the sole gate; NO tenant principal on this route.
    const publicRoute = { config: { security: securityAccess.public() } }

    app.get('/activity', {
        ...publicRoute,
        schema: {
            tags: ['browser-agent'],
            description: 'Operator-only: agent activity across ALL tenants, grouped by platform. Gated by the operator key; not reachable by any tenant principal.',
            querystring: AgentOperatorActivityRequest,
            response: { [StatusCodes.OK]: AgentOperatorActivityResponse },
        },
    }, async (request, reply) => {
        const rows = await browserAgentActivity(request.log).operatorActivity(
            request.query.days ?? 30,
            request.query.limit ?? 50,
        )
        await reply.status(StatusCodes.OK).send(rows)
    })
}
