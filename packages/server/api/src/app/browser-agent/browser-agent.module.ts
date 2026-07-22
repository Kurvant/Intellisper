import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { platformMustHaveFeatureEnabledOrPaymentRequired } from '../enterprise/authentication/ee-authorization'
import { browserAgentAutomationController } from './automation/browser-agent-automation.controller'
import { browserAgentChatController } from './browser-agent-chat.controller'
import { browserAgentConversationController } from './browser-agent-conversation.controller'
import { browserAgentHealthController } from './browser-agent-health.controller'
import { browserAgentFileController } from './files/browser-agent-file.controller'
import { browserAgentGrammarController } from './grammar/browser-agent-grammar.controller'
import { browserAgentRoutineController } from './routine/browser-agent-routine.controller'
import { browserAgentOversightController } from './runtime/browser-agent-oversight.controller'
import { browserAgentRunController } from './runtime/browser-agent-run.controller'
import { browserAgentTenancyController } from './tenancy/browser-agent-tenancy.controller'
import { browserAgentUsageController } from './usage/browser-agent-usage.controller'

/**
 * Browser Agent module — the Intellisper browser-automation agent ported into blockunits.
 *
 * Namespaced `browser-agent` (routes under `/api/v1/browser-agent/*`) to stay distinct from the
 * existing `agentsModule` (`app/agents/`), which is blockunits' native AI-agent flow-STEP feature
 * (glossary `Agent`/`AgentTool`). These are two different products in one server; do not merge them.
 *
 * Registered only under CLOUD/ENTERPRISE editions (see app.ts) — importing the EE authorization
 * guard here is therefore edition-safe (COMMUNITY never loads this module).
 *
 * PLAN GATING (SUBSCRIPTION_PLANS_PROPOSAL §7.6): every PRODUCT surface sits behind
 * `plan.browserAgentEnabled` — the product-scope door. A platform without the agent on its plan gets
 * a clean FEATURE_DISABLED (402 Payment Required), which is what "not on your plan" means; it is not
 * an access-control failure. Two surfaces are deliberately NOT gated:
 *  - health (`/ping`): a liveness probe; gating it would make the module look down rather than locked.
 *  - tenancy: this is the surface a platform uses to ADOPT the agent (product scope / transfer).
 *    Gating it on the very flag it exists to set would be a chicken-and-egg lock-out.
 * The per-plan CAPS (batch/schedule/reasoning + monthly metric limits) are enforced separately and
 * deeper, at each consumption seam, via the `browserAgentPlan` resolver.
 *
 * MEMORY IS NOT HERE. It is a cross-product capability (Studio buys it for org/flow memory with no
 * agent), so it lives in its own `memoryModule` behind its own `memoryCaps` door. Registering it
 * inside this agent-gated plugin is exactly what made memory unusable and unsellable to Studio.
 */
export const browserAgentModule: FastifyPluginAsyncZod = async (app) => {
    // Ungated: liveness + the adoption path.
    await app.register(browserAgentHealthController, { prefix: '/v1/browser-agent' })
    await app.register(browserAgentTenancyController, { prefix: '/v1/browser-agent/tenancy' })

    // Every product surface is gated on the plan's agent door. Registered inside a child plugin so
    // the preHandler applies to these routes only (Fastify encapsulation), never to the two above.
    await app.register(async (gated) => {
        gated.addHook('preHandler', platformMustHaveFeatureEnabledOrPaymentRequired((platform) => platform.plan.browserAgentEnabled))

        await gated.register(browserAgentChatController, { prefix: '/v1/browser-agent' })
        await gated.register(browserAgentConversationController, { prefix: '/v1/browser-agent' })
        // Tier 1 — the acting user's own runs list ("my agent activity").
        await gated.register(browserAgentRunController, { prefix: '/v1/browser-agent/runs' })
        // Tier 2 — tenant-admin platform-wide oversight (platformAdminOnly-gated inside the controller;
        // platformId is taken from the principal, so it only ever reads the caller's own tenant).
        await gated.register(browserAgentOversightController, { prefix: '/v1/browser-agent/admin/oversight' })
        await gated.register(browserAgentGrammarController, { prefix: '/v1/browser-agent/grammar' })
        await gated.register(browserAgentFileController, { prefix: '/v1/browser-agent/files' })
        await gated.register(browserAgentRoutineController, { prefix: '/v1/browser-agent/routines' })
        await gated.register(browserAgentAutomationController, { prefix: '/v1/browser-agent/automation' })
        await gated.register(browserAgentUsageController, { prefix: '/v1/browser-agent/usage' })
    })
}
