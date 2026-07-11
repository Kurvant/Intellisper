// STUB (clean-room scaffolding) — shared no-op module factory.
//
// Produces a Fastify plugin that registers NO routes. Used for enterprise feature
// modules whose endpoints are reached ONLY behind plan/edition/`enabled:` gates in
// the frontend (verified by the frontend gating audit — see
// cleanup-process-documentation.md "MODULE-STUB POLICY"). In the community edition
// those screens are locked, so the endpoints are never called; registering nothing
// is safe.
//
// IMPORTANT: do NOT use this for any endpoint the frontend calls UNCONDITIONALLY
// (those modules are implemented for real — e.g. platformProjectModule,
// projectMemberModule). When a feature is rebuilt, replace its stub with the real
// module.
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function createEnterpriseStubModule(_featureName: string): FastifyPluginAsyncZod {
    // Registers no routes. _featureName documents the feature at the call site and
    // aids tracing (search for createEnterpriseStubModule).
    return async () => {
        // no-op: routes are added when the real feature is implemented.
    }
}
