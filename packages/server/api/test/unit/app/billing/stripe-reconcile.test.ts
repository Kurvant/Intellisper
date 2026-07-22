import {
    AGENT_FREE_PLAN,
    AGENT_PRO_PLAN,
    COMPLETE_FREE_PLAN,
    COMPLETE_PRO_PLAN,
    PlanName,
    STUDIO_FREE_PLAN,
    STUDIO_PRO_PLAN,
} from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

/**
 * The Stripe → entitlements reconciler. This is where money becomes access, so every case here is a
 * real-money correctness property:
 *  - the subscribed tier's entitlements are applied WHOLESALE (never half-applied),
 *  - add-on line items compose without being mistaken for the base plan,
 *  - an unrecognised subscription NEVER grants entitlements (no guessing),
 *  - cancelling drops the customer to the FREE tier of the product they actually use.
 */

const { planUpdate, getOrCreate, extraFlowsPriceId, planForPriceId } = vi.hoisted(() => ({
    planUpdate: vi.fn().mockResolvedValue(undefined),
    getOrCreate: vi.fn(),
    extraFlowsPriceId: vi.fn().mockReturnValue('price_extra_active_flows'),
    planForPriceId: vi.fn(),
}))

vi.mock('../../../../src/app/enterprise/platform/platform-plan/platform-plan.service', () => ({
    platformPlanService: () => ({ update: planUpdate, getOrCreateForPlatform: getOrCreate }),
}))
vi.mock('../../../../src/app/enterprise/platform/platform-plan/stripe-helper', () => ({
    StripeCheckoutType: { CREDIT_PURCHASE: 'credit-purchase', CREDIT_AUTO_TOP_UP: 'credit-auto-top-up' },
    stripeHelper: () => ({
        extraActiveFlowsPriceId: extraFlowsPriceId,
        getSubscriptionPeriod: async () => ({ startDate: 100, endDate: 200, cancelDate: undefined }),
    }),
}))
vi.mock('../../../../src/app/enterprise/platform/platform-plan/plan-price', () => ({
    planPrice: { planForPriceId },
}))
vi.mock('../../../../src/app/enterprise/platform/platform-plan/platform-ai-credits.service', () => ({
    platformAiCreditsService: () => ({ creditPaymentSucceeded: vi.fn(), handleAutoTopUpCheckoutSessionCompleted: vi.fn() }),
}))

import { onSubscriptionChanged } from '../../../../src/app/enterprise/platform/platform-plan/stripe-billing.controller'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never

/** Build a Stripe subscription with the given price-id line items. */
function subscription(priceIds: Array<{ id: string, quantity?: number }>): Stripe.Subscription {
    return {
        id: 'sub_1',
        status: 'active',
        metadata: { platformId: 'plat_1' },
        items: { data: priceIds.map((p) => ({ price: { id: p.id }, quantity: p.quantity ?? 1 })) },
    } as unknown as Stripe.Subscription
}

/** The entitlement payload the reconciler wrote. */
function written(): Record<string, unknown> {
    expect(planUpdate).toHaveBeenCalled()
    return planUpdate.mock.calls[planUpdate.mock.calls.length - 1][0] as Record<string, unknown>
}

beforeEach(() => {
    planUpdate.mockReset().mockResolvedValue(undefined)
    getOrCreate.mockReset()
    planForPriceId.mockReset()
    extraFlowsPriceId.mockReset().mockReturnValue('price_extra_active_flows')
})

describe('a subscribed tier applies its WHOLE entitlement set', () => {
    it('Agent Pro: opens the agent, grants its caps, sets credits — all from the one constant', async () => {
        planForPriceId.mockImplementation((id: string) => (id === 'price_agent_pro' ? PlanName.AGENT_PRO : undefined))
        await onSubscriptionChanged(log, 'customer.subscription.updated', subscription([{ id: 'price_agent_pro' }]))

        const w = written()
        expect(w.plan).toBe(PlanName.AGENT_PRO)
        expect(w.browserAgentEnabled).toBe(true)
        expect(w.agentCaps).toEqual(AGENT_PRO_PLAN.agentCaps)
        expect(w.includedAiCredits).toBe(AGENT_PRO_PLAN.includedAiCredits)
        expect(w.stripeSubscriptionId).toBe('sub_1')
        expect(w.stripeSubscriptionStatus).toBe('active')
    })

    it('Studio Pro: grants flows but leaves the agent CLOSED (the customer did not buy it)', async () => {
        planForPriceId.mockImplementation((id: string) => (id === 'price_studio_pro' ? PlanName.STUDIO_PRO : undefined))
        await onSubscriptionChanged(log, 'customer.subscription.updated', subscription([{ id: 'price_studio_pro' }]))

        const w = written()
        expect(w.plan).toBe(PlanName.STUDIO_PRO)
        expect(w.activeFlowsLimit).toBe(STUDIO_PRO_PLAN.activeFlowsLimit)
        expect(w.browserAgentEnabled).toBe(false)
    })

    it('Complete Pro: opens BOTH products', async () => {
        planForPriceId.mockImplementation((id: string) => (id === 'price_complete_pro' ? PlanName.COMPLETE_PRO : undefined))
        await onSubscriptionChanged(log, 'customer.subscription.updated', subscription([{ id: 'price_complete_pro' }]))

        const w = written()
        expect(w.browserAgentEnabled).toBe(true)
        expect(w.agentCaps).toEqual(COMPLETE_PRO_PLAN.agentCaps)
        expect(w.activeFlowsLimit).toBe(COMPLETE_PRO_PLAN.activeFlowsLimit)
    })
})

describe('add-on line items compose with the base plan', () => {
    it('extra active flows ADD to the tier allowance (and are matched by the add-on price, not item order)', async () => {
        planForPriceId.mockImplementation((id: string) => (id === 'price_studio_pro' ? PlanName.STUDIO_PRO : undefined))
        await onSubscriptionChanged(log, 'customer.subscription.updated', subscription([
            { id: 'price_studio_pro', quantity: 1 },
            { id: 'price_extra_active_flows', quantity: 7 },
        ]))

        const w = written()
        expect(w.activeFlowsLimit).toBe((STUDIO_PRO_PLAN.activeFlowsLimit ?? 0) + 7)
    })

    it('the base-plan quantity is NEVER mistaken for the add-on quantity', async () => {
        // Regression: the previous implementation matched "the item whose price equals item[0]'s
        // price", which always read back the BASE item's quantity as if it were extra flows.
        planForPriceId.mockImplementation((id: string) => (id === 'price_agent_pro' ? PlanName.AGENT_PRO : undefined))
        await onSubscriptionChanged(log, 'customer.subscription.updated', subscription([
            { id: 'price_agent_pro', quantity: 3 }, // e.g. 3 seats — NOT 3 extra flows
        ]))

        const w = written()
        // Agent Pro sells no flows; a seat quantity must not silently become an active-flow grant.
        expect(w.activeFlowsLimit).toBe(AGENT_PRO_PLAN.activeFlowsLimit)
    })

    it('an add-on alone (no recognised base plan) grants NOTHING', async () => {
        planForPriceId.mockReturnValue(undefined)
        await onSubscriptionChanged(log, 'customer.subscription.updated', subscription([
            { id: 'price_extra_active_flows', quantity: 5 },
        ]))

        const w = written()
        // Commercial state is recorded, but no entitlement fields are touched — we never guess a tier.
        expect(w.stripeSubscriptionId).toBe('sub_1')
        expect(w.plan).toBeUndefined()
        expect(w.browserAgentEnabled).toBeUndefined()
        expect(w.agentCaps).toBeUndefined()
        expect(w.activeFlowsLimit).toBeUndefined()
    })
})

describe('cancellation drops to the FREE tier of the product actually used', () => {
    it('an Agent customer lands on Agent Free (not a Studio plan)', async () => {
        getOrCreate.mockResolvedValue({ browserAgentEnabled: true, activeFlowsLimit: 0 })
        await onSubscriptionChanged(log, 'customer.subscription.deleted', subscription([{ id: 'price_agent_pro' }]))

        const w = written()
        expect(w.plan).toBe(AGENT_FREE_PLAN.plan)
        expect(w.browserAgentEnabled).toBe(true) // keeps the agent, at free caps
        expect(w.agentCaps).toEqual(AGENT_FREE_PLAN.agentCaps)
        expect(w.stripeSubscriptionStatus).toBe('canceled')
        expect(w.stripeSubscriptionId).toBeUndefined()
    })

    it('a Studio customer lands on Studio Free (agent stays closed)', async () => {
        getOrCreate.mockResolvedValue({ browserAgentEnabled: false, activeFlowsLimit: 40 })
        await onSubscriptionChanged(log, 'customer.subscription.deleted', subscription([{ id: 'price_studio_pro' }]))

        const w = written()
        expect(w.plan).toBe(STUDIO_FREE_PLAN.plan)
        expect(w.browserAgentEnabled).toBe(false)
    })

    it('a dual customer lands on Complete Free (keeps both doors, at free caps)', async () => {
        getOrCreate.mockResolvedValue({ browserAgentEnabled: true, activeFlowsLimit: 40 })
        await onSubscriptionChanged(log, 'customer.subscription.deleted', subscription([{ id: 'price_complete_pro' }]))

        const w = written()
        expect(w.plan).toBe(COMPLETE_FREE_PLAN.plan)
        expect(w.browserAgentEnabled).toBe(true)
        expect((w.activeFlowsLimit as number) ?? 0).toBeGreaterThan(0)
    })
})

describe('safety', () => {
    it('a subscription with no platformId is ignored entirely', async () => {
        const orphan = { id: 'sub_x', status: 'active', metadata: {}, items: { data: [] } } as unknown as Stripe.Subscription
        await onSubscriptionChanged(log, 'customer.subscription.updated', orphan)
        expect(planUpdate).not.toHaveBeenCalled()
    })
})
