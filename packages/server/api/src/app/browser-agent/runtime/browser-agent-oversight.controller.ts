import {
    AgentOversightRequest,
    AgentOversightResponse,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { browserAgentActivity } from './browser-agent-activity.service'

/**
 * Tier 2 — TENANT-ADMIN agent oversight. Platform-wide agent activity for the caller's OWN platform:
 * total runs, active users, token spend, success rate, runs-by-status/day, top routines, per-user
 * activity.
 *
 * SCOPE SAFETY — two independent guarantees:
 *   1. `platformAdminOnly` asserts the caller is a PlatformRole.ADMIN of their own platform (the same
 *      gate the /platform/* admin web area uses). A non-admin, or an admin of another platform, is
 *      rejected before the handler runs.
 *   2. The `platformId` handed to the aggregate is `request.principal.platform.id` — taken from the
 *      authenticated principal, NEVER from the request — and the service aggregates via
 *      `agentScope.platformFilter`. So the numbers are always this tenant's, and a caller cannot name
 *      another platform.
 *
 * This controller is registered INSIDE the plan-gated child plugin (browser-agent.module.ts), so a
 * platform without the agent on its plan gets a 402 here too. No default period leaks anything: the
 * window only bounds a scan that is already tenant-scoped.
 */
export const browserAgentOversightController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', {
        config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) },
        schema: {
            tags: ['browser-agent'],
            description: 'Tenant-admin: platform-wide agent activity for the caller\'s own platform over a moving window.',
            querystring: AgentOversightRequest,
            response: { [StatusCodes.OK]: AgentOversightResponse },
        },
    }, async (request, reply) => {
        // platformId comes from the PRINCIPAL — the whole tenant-isolation guarantee of this route.
        const platformId = request.principal.platform.id
        const days = request.query.days ?? 30
        const overview = await browserAgentActivity(request.log).platformOverview({ platformId }, days)
        await reply.status(StatusCodes.OK).send(overview)
    })
}
