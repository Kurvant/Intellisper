import { z } from 'zod'

/**
 * Minimal read-only subscription summary the extension shows on its subscription card. Derived from
 * the platform's plan row: the plan name, an active status marker, and whether the browser-agent
 * product is unlocked (the product-scope door — `plan.browserAgentEnabled`).
 */
export const SubscriptionSummaryResponse = z.object({
    plan: z.string(),
    status: z.string(),
    browserAgentEnabled: z.boolean(),
})
export type SubscriptionSummaryResponse = z.infer<typeof SubscriptionSummaryResponse>
