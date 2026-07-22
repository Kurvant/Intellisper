import {
    AgentUsageMetric,
    AgentUsageProjectRequest,
    AgentUsageSummaryResponse,
    PrincipalType,
    SubscriptionSummaryResponse,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { platformService } from '../../platform/platform.service'
import { browserAgentPlan } from './browser-agent-plan.service'
import { browserAgentUsage } from './browser-agent-usage.service'

/**
 * Usage surface: current-month consumption vs the plan caps, per metered metric. Read-only; the
 * counter is pooled per platform, so a platform-scoped read (no per-user filter) is correct — this is
 * the tenant's aggregate meter, the same figure billing/limits act on.
 */
export const browserAgentUsageController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Current-month browser-agent usage vs the plan caps, per metered metric.',
            querystring: AgentUsageProjectRequest,
            response: { [StatusCodes.OK]: AgentUsageSummaryResponse },
        },
    }, async (request, reply) => {
        const platformId = request.principal.platform.id
        const [used, caps] = await Promise.all([
            browserAgentUsage(request.log).currentUsage(platformId),
            browserAgentPlan(request.log).capsForPlatform(platformId),
        ])
        const metrics = Object.values(AgentUsageMetric).map((metric) => ({
            metric,
            used: used[metric] ?? 0,
            cap: caps.monthly[metric],
        }))
        await reply.status(StatusCodes.OK).send({ period: new Date().toISOString().slice(0, 7), metrics })
    })

    /**
     * Minimal read-only subscription summary for the extension's subscription card. Derived straight
     * from the platform's plan row: the plan name and whether the browser-agent product is unlocked.
     */
    app.get('/subscription', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Read-only subscription summary (plan name + browser-agent entitlement) for the extension.',
            querystring: AgentUsageProjectRequest,
            response: { [StatusCodes.OK]: SubscriptionSummaryResponse },
        },
    }, async (request, reply) => {
        const platformId = request.principal.platform.id
        const platform = await platformService(request.log).getOneWithPlanOrThrow(platformId)
        await reply.status(StatusCodes.OK).send({
            plan: platform.plan.plan ?? 'free',
            status: 'active',
            browserAgentEnabled: platform.plan.browserAgentEnabled,
        })
    })
}
