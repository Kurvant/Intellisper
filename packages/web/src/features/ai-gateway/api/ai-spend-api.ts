import { AiSpendSummary } from '@intelblocks/shared';

import { api } from '@/lib/api';

/**
 * AI Gateway — TENANT spend reporting.
 *
 * `spend` returns the CURRENT tenant's own AI cost. The server scopes it to the authenticated
 * platform; the platform id is never sent from here, so it cannot be tampered with.
 *
 * There is deliberately NO cross-tenant "operator" call here. That surface
 * (`/v1/admin/ai-gateway/spend`) is gated by the operator key — a server-side secret that a browser
 * must never hold — and is reached by internal tooling, not the tenant web app. Exposing it from here
 * would put a cross-tenant read one fetch away from any tenant admin's browser.
 */
export const aiSpendApi = {
  spend(days?: number) {
    return api.get<AiSpendSummary>('/v1/ai-gateway/spend', { days });
  },
};
