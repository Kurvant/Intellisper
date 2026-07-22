// Subscription-tier ↔ Stripe-price mapping (SUBSCRIPTION_PLANS_PROPOSAL §7.7).
//
// The price ids are NOT hardcoded: they differ per Stripe account/environment, and a
// wrong-but-plausible literal would silently bill the wrong amount or grant the wrong tier. They are
// configured as ONE JSON map (`IB_STRIPE_PLAN_PRICE_IDS`) keyed by PlanName, e.g.
//   {"agent_starter":"price_1..","agent_pro":"price_2..","complete_pro":"price_3.."}
//
// Both directions are needed and must agree: checkout resolves plan → price, and the webhook
// reconciler resolves price → plan. Deriving both from the same parsed map makes a mismatch
// impossible.
import { BILLABLE_PLANS, isNil, PlanName } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'

type PriceMap = {
    planToPrice: Map<PlanName, string>
    priceToPlan: Map<string, PlanName>
}

let cached: PriceMap | null = null

/**
 * Parse the configured map once. A malformed/absent config yields EMPTY maps rather than throwing at
 * import time — billing is inert outside cloud, and a self-hosted deployment must still boot. Callers
 * that actually need a price fail loudly at that point (see `priceIdForPlan`).
 */
function loadPriceMap(log?: FastifyBaseLogger): PriceMap {
    if (!isNil(cached)) {
        return cached
    }
    const planToPrice = new Map<PlanName, string>()
    const priceToPlan = new Map<string, PlanName>()

    const raw = system.get(AppSystemProp.STRIPE_PLAN_PRICE_IDS)
    if (!isNil(raw) && raw.trim().length > 0) {
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>
            for (const [planKey, priceId] of Object.entries(parsed)) {
                if (typeof priceId !== 'string' || priceId.length === 0) {
                    continue
                }
                const plan = planKey as PlanName
                // Only accept names that are real, billable plans — a typo must not create a phantom
                // tier that later reconciles a subscription onto an entitlement set we never defined.
                if (!BILLABLE_PLANS.includes(plan)) {
                    log?.warn({ planKey }, '[planPrice] ignoring unknown/non-billable plan in STRIPE_PLAN_PRICE_IDS')
                    continue
                }
                if (priceToPlan.has(priceId)) {
                    log?.warn({ priceId }, '[planPrice] duplicate price id maps to multiple plans — ignoring the later one')
                    continue
                }
                planToPrice.set(plan, priceId)
                priceToPlan.set(priceId, plan)
            }
        }
        catch (err) {
            log?.error({ err: (err as Error).message }, '[planPrice] STRIPE_PLAN_PRICE_IDS is not valid JSON — no subscription tiers are purchasable')
        }
    }

    cached = { planToPrice, priceToPlan }
    return cached
}

export const planPrice = {
    /** The Stripe price id for a billable plan, or undefined when it has not been configured. */
    priceIdForPlan(plan: PlanName, log?: FastifyBaseLogger): string | undefined {
        return loadPriceMap(log).planToPrice.get(plan)
    },

    /**
     * The plan a Stripe price id represents, or undefined when the price is not one of ours (e.g. the
     * `active-flow` / `ai-credit` add-on line items, which are NOT base plans). The webhook uses this
     * to identify the subscribed tier while ignoring add-on items.
     */
    planForPriceId(priceId: string | null | undefined, log?: FastifyBaseLogger): PlanName | undefined {
        if (isNil(priceId)) {
            return undefined
        }
        return loadPriceMap(log).priceToPlan.get(priceId)
    },

    /** Whether any subscription tier is purchasable in this deployment. */
    isConfigured(log?: FastifyBaseLogger): boolean {
        return loadPriceMap(log).planToPrice.size > 0
    },

    /** Test seam: drop the parsed cache so a changed config is re-read. */
    _reset(): void {
        cached = null
    },
}
