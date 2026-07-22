import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { browserAgentMemoryAdminController } from '../browser-agent/memory/browser-agent-memory-admin.controller'
import { browserAgentMemoryController } from '../browser-agent/memory/browser-agent-memory.controller'
import { memoryEngineController } from './memory-engine.controller'

/**
 * MEMORY — a cross-product module, registered OUTSIDE the browser-agent's plan gate.
 *
 * Memory is used by either product (agent → personal memory; Studio → org/flow memory), so it must
 * not sit behind `browserAgentEnabled`. Previously both controllers were registered inside the
 * agent-gated child plugin, which meant a Studio-only platform got 402 on its own org memory.
 *
 * There is no plan gate at THIS level: the paid door is memory's own, enforced per-surface by the
 * controllers via `memoryPlan.assertEnabled()` (reading `platform_plan.memoryCaps`). Keeping the
 * gate in the controllers rather than here means it travels with the routes no matter where they
 * are mounted — including the legacy alias below.
 *
 * ROUTE PATHS — both prefixes serve the SAME controllers:
 *   - `/v1/memory/*`               the canonical, product-neutral home.
 *   - `/v1/browser-agent/memory/*` retained VERBATIM and indefinitely. The browser extension is an
 *     external client shipping from a separate repo; older installs pin these paths and cannot be
 *     force-upgraded. Deprecated in favour of `/v1/memory/*`, never removed.
 */
export const memoryModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(browserAgentMemoryController, { prefix: '/v1/memory' })
    await app.register(browserAgentMemoryAdminController, { prefix: '/v1/admin/memory' })
    // Flow steps (engine sandbox). Registered separately from the member surface because it carries
    // a different principal type and a strictly narrower scope set — org/flow only, never personal.
    await app.register(memoryEngineController, { prefix: '/v1/memory/engine' })

    // Legacy aliases — see the note above. Same controllers, same gate, unchanged behaviour.
    await app.register(browserAgentMemoryController, { prefix: '/v1/browser-agent/memory' })
    await app.register(browserAgentMemoryAdminController, { prefix: '/v1/browser-agent/admin/memory' })
}
