// AI Gateway — the OPERATOR (Intellisper company) cross-tenant spend surface.
//
// This endpoint aggregates AI cost ACROSS ALL TENANTS (it is grouped by platformId, NOT filtered to
// one), so it is the answer to "which customers cost us the most / does a plan's price cover its
// usage". That data belongs ONLY to the company running the install — never to a customer.
//
// It is deliberately built to the same access model as the super-admin platform surface
// (`admin-platform.controller.ts`, capability spec C.5), because a cross-tenant read has the same
// blast radius as a cross-tenant admin action:
//
//   1. The whole surface is gated by the OPERATOR KEY (`AppSystemProp.API_KEY`) presented in a
//      request header. Deny-by-default: if no key is configured, the surface is closed.
//   2. Routes are otherwise `public()` — the header check is the entire gate, so NO tenant-principal
//      (JWT) path can reach it. This is the crucial difference from `platformAdminOnly`, which on a
//      multi-tenant cloud install means "an admin of ANY tenant" and would leak every customer's costs.
//   3. The module is registered ONLY under `IbEdition.CLOUD` (see app.ts). On a self-hosted install
//      there is one tenant, so a cross-tenant view is meaningless — the tenant's own `/spend` already
//      shows everything — and this surface simply never mounts (404), exactly like adminPlatformModule.
import { AiSpendAdminQuery, AiSpendAdminResponse, IbEdition, isNil } from '@intelblocks/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { aiSpendService } from './ai-spend.service'

const OPERATOR_KEY_HEADER = 'api-key'

/**
 * Gate the whole surface. TWO independent checks, either of which alone denies:
 *
 *   1. Edition MUST be CLOUD. This module is only registered under the CLOUD case in app.ts, so this
 *      is defense-in-depth: even if a future refactor mis-registers it in another edition, a
 *      cross-tenant read still cannot happen on a self-hosted single-tenant install.
 *   2. The operator key MUST match. Deny-by-default: an unset key means the surface is CLOSED, never
 *      "open to everyone". The key is a server-side secret; no browser/tenant principal can present it.
 *
 * Because the gate is a header secret (not a JWT), there is no id or URL a tenant can tamper with to
 * pass it — changing a path/query/id gets you nowhere without the secret itself.
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

export const aiGatewayAdminModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preHandler', assertOperator)
    await app.register(aiGatewayAdminController, { prefix: '/v1/admin/ai-gateway' })
}

const aiGatewayAdminController: FastifyPluginAsyncZod = async (app) => {
    // Public per-route: the operator-key preHandler above is the sole gate. There is NO tenant
    // principal on this route, by design — a tenant must not be able to reach cross-tenant costs.
    const publicRoute = { config: { security: securityAccess.public() } }

    app.get('/spend', {
        ...publicRoute,
        schema: {
            tags: ['ai-gateway'],
            description: 'Operator-only: AI spend across ALL tenants, ranked by cost. Gated by the operator key; not reachable by any tenant principal.',
            querystring: AiSpendAdminQuery,
            response: { [StatusCodes.OK]: AiSpendAdminResponse },
        },
    }, async (request, reply) => {
        const rows = await aiSpendService(request.log).summaryAcrossPlatforms({
            days: request.query.days,
            limit: request.query.limit,
        })
        await reply.status(StatusCodes.OK).send({ rows })
    })
}
