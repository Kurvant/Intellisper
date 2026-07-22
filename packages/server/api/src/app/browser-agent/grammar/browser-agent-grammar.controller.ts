import {
    AgentUsageMetric,
    BrowserAgentGrammarRequest,
    BrowserAgentGrammarResponse,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { browserAgentPlan } from '../usage/browser-agent-plan.service'
import { browserAgentUsage } from '../usage/browser-agent-usage.service'
import { browserAgentGrammar } from './browser-agent-grammar.service'

/**
 * Grammar quick-tool. A plain request/response (NOT SSE) — it bypasses the agent loop. Project-
 * scoped by membership; metered against the QUICK_TOOLS monthly cap before the (cheap) model call.
 */
export const browserAgentGrammarController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Proofread text: returns corrected text + deterministic highlight ranges.',
            body: BrowserAgentGrammarRequest,
            response: { [StatusCodes.OK]: BrowserAgentGrammarResponse },
        },
    }, async (request, reply) => {
        const platformId = request.principal.platform.id
        const caps = await browserAgentPlan(request.log).capsForPlatform(platformId)
        await browserAgentUsage(request.log).meter({ platformId, metric: AgentUsageMetric.QUICK_TOOLS, cap: caps.monthly[AgentUsageMetric.QUICK_TOOLS] })
        const result = await browserAgentGrammar(request.log).check(request.body.text, platformId)
        await reply.status(StatusCodes.OK).send(result)
    })
}
