import {
    AiSpendQuery,
    AiSpendSummaryResponse,
    PrincipalType,
    ReportAiUsageBatchRequest,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { aiSpendService } from './ai-spend.service'
import { aiUsageSink } from './ai-usage-sink'

/**
 * AI Gateway — the TENANT-facing read surface + the engine ingest.
 *
 * Everything here is scoped to a SINGLE tenant, so it is safe to register in every edition where the
 * agent runs:
 *
 *   GET  /v1/ai-gateway/spend   a platform admin sees their OWN tenant's AI spend. The platform id is
 *                               taken from the authenticated principal, NEVER from the request — a
 *                               caller cannot name a platform they do not own.
 *   POST /v1/ai-gateway/usage   the engine reports a block's usage. Tenant attribution is taken from
 *                               the engine TOKEN, not the payload.
 *
 * The CROSS-TENANT operator view lives in a SEPARATE module (`aiGatewayAdminModule` below), because it
 * needs a different, stronger gate and must only exist on the multi-tenant cloud install. Keeping the
 * two apart is what stops the operator surface from leaking into a tenant-facing plugin.
 *
 * Both routes here are read-only except the ingest; the ONLY writer of the ledger is the async sink.
 */
export const aiGatewayModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(aiGatewayController, { prefix: '/v1/ai-gateway' })
}

const aiGatewayController: FastifyPluginAsyncZod = async (app) => {
    app.get('/spend', {
        config: { security: securityAccess.unscoped([PrincipalType.USER]) },
        schema: {
            tags: ['ai-gateway'],
            description: 'AI spend for the current platform over a moving window: cost (what we pay), revenue (what we charge), and margin, broken down by product surface and model.',
            querystring: AiSpendQuery,
            response: { [StatusCodes.OK]: AiSpendSummaryResponse },
        },
    }, async (request, reply) => {
        // The tenant is taken from the AUTHENTICATED PRINCIPAL, never from the request. There is no
        // path by which a caller can name a platform they do not own.
        const platformId = request.principal.platform.id
        const summary = await aiSpendService(request.log).summaryForPlatform({
            platformId,
            days: request.query.days,
        })
        await reply.status(StatusCodes.OK).send(summary)
    })

    /**
     * Ingest — AI spend from BLOCKS running in the engine sandbox.
     *
     * The engine cannot reach the worker's RPC socket and cannot import server code; its one sanctioned
     * channel to the API is an HTTP call bearing the engine JWT (the same channel it already uses to
     * fetch the provider config). So this is that channel, and nothing new architecturally.
     *
     * SECURITY — the tenant is taken from the TOKEN, never from the body. The engine JWT carries
     * `platformId` and `projectId` as verified claims, so we OVERWRITE whatever the payload says. A
     * block therefore cannot attribute its spend to another customer, even if it tried: the worst it
     * can do is misreport its own. Anything else in the payload (tokens, model, cost) is data the
     * block legitimately owns.
     */
    app.post('/usage', {
        config: { security: securityAccess.engine() },
        schema: {
            tags: ['ai-gateway'],
            description: 'Report AI usage incurred by an AI block inside the engine sandbox. Tenant attribution is taken from the engine token, not the payload.',
            body: ReportAiUsageBatchRequest,
            response: { [StatusCodes.NO_CONTENT]: z.void() },
        },
    }, async (request, reply) => {
        const platformId = request.principal.platform.id
        const projectId = request.principal.projectId

        const calls = request.body.calls.map((c) => ({
            ...c,
            // Token claims WIN. This is the whole security boundary of this route.
            platformId,
            projectId: projectId ?? c.projectId ?? null,
        }))

        // Straight to the async sink: no DB write on this request's path, so a flow's AI step never
        // waits on the ledger.
        aiUsageSink(request.log).recordBatch(calls)
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}
