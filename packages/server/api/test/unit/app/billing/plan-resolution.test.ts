import { AGENT_CAPS_NONE, AGENT_CAPS_PRO, AgentUsageMetric, PlanName, UNLIMITED_CAP } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two runtime-critical pieces of the plan rollout:
 *  1. `browserAgentPlan.capsForPlatform` — reads the platform's entitlements from the plan row. This
 *     decides what a customer may do, so its FAILURE modes matter as much as its happy path.
 *  2. `planPrice` — maps Stripe prices ↔ plans in BOTH directions. A mismatch here reconciles a
 *     subscription onto the wrong tier (wrong entitlements for real money).
 */

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('../../../../src/app/database/database-connection', () => ({
    databaseConnection: () => ({ query: queryMock }),
}))

const { systemGet } = vi.hoisted(() => ({ systemGet: vi.fn() }))
vi.mock('../../../../src/app/helper/system/system', () => ({
    system: { get: systemGet, getEdition: () => 'cloud', getOrThrow: systemGet },
}))

import { browserAgentPlan } from '../../../../src/app/browser-agent/usage/browser-agent-plan.service'
import { planPrice } from '../../../../src/app/enterprise/platform/platform-plan/plan-price'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const caps = () => browserAgentPlan(log)

beforeEach(() => {
    queryMock.mockReset()
    systemGet.mockReset()
    planPrice._reset()
})

describe('capsForPlatform — reads entitlements from the plan row', () => {
    it('returns the plan\'s stored caps when the agent door is open', async () => {
        queryMock.mockResolvedValue([{ browserAgentEnabled: true, agentCaps: AGENT_CAPS_PRO }])
        expect(await caps().capsForPlatform('p1')).toEqual(AGENT_CAPS_PRO)
    })

    it('DENIES everything when the agent is not on the plan — even if caps somehow exist', async () => {
        // The door is the authority: a stale caps blob must never grant access on a plan that
        // doesn't include the product.
        queryMock.mockResolvedValue([{ browserAgentEnabled: false, agentCaps: AGENT_CAPS_PRO }])
        expect(await caps().capsForPlatform('p1')).toEqual(AGENT_CAPS_NONE)
    })

    it('DENIES when there is no plan row at all', async () => {
        queryMock.mockResolvedValue([])
        expect(await caps().capsForPlatform('p1')).toEqual(AGENT_CAPS_NONE)
    })

    it('DENIES when the caps blob is missing or malformed (never infer an entitlement)', async () => {
        queryMock.mockResolvedValue([{ browserAgentEnabled: true, agentCaps: null }])
        expect(await caps().capsForPlatform('p1')).toEqual(AGENT_CAPS_NONE)

        queryMock.mockResolvedValue([{ browserAgentEnabled: true, agentCaps: { garbage: true } }])
        expect(await caps().capsForPlatform('p1')).toEqual(AGENT_CAPS_NONE)

        // A blob missing ONE metric is still malformed — partial trust is how caps leak.
        queryMock.mockResolvedValue([{
            browserAgentEnabled: true,
            agentCaps: { ...AGENT_CAPS_PRO, monthly: { ACTIONS: 10 } },
        }])
        expect(await caps().capsForPlatform('p1')).toEqual(AGENT_CAPS_NONE)

        // A blob with a wrong-typed privilege field must not be trusted either. (Memory's fields
        // moved out to `memoryCaps`, so the probe here is an agent-owned field.)
        queryMock.mockResolvedValue([{
            browserAgentEnabled: true,
            agentCaps: { ...AGENT_CAPS_PRO, reasoningAllowed: 'yes-please' },
        }])
        expect(await caps().capsForPlatform('p1')).toEqual(AGENT_CAPS_NONE)
    })

    it('on a DB FAULT: privileges fail CLOSED but metered work is not falsely denied', async () => {
        queryMock.mockRejectedValue(new Error('connection reset'))
        const degraded = await caps().capsForPlatform('p1')

        // Never over-grant a privilege on a fault. (Memory has its own resolver now, which applies
        // the same fail-closed rule to its own faults — see the memory entitlement suite.)
        expect(degraded.reasoningAllowed).toBe(false)
        expect(degraded.maxBatchRows).toBe(0)
        expect(degraded.maxSchedules).toBe(0)

        // But do NOT tell a paying customer their feature "isn't on their plan" because of a blip:
        // a cap of 0 would deny; unlimited lets the (fail-open) meter allow the action and record it.
        for (const metric of Object.values(AgentUsageMetric)) {
            expect(degraded.monthly[metric]).toBe(UNLIMITED_CAP)
        }
    })
})

describe('planPrice — Stripe price ↔ plan, both directions', () => {
    function configure(map: Record<string, string>) {
        systemGet.mockImplementation((prop: string) =>
            prop === 'STRIPE_PLAN_PRICE_IDS' ? JSON.stringify(map) : undefined,
        )
        planPrice._reset()
    }

    it('maps a configured plan to its price and back', () => {
        configure({ [PlanName.AGENT_PRO]: 'price_agent_pro', [PlanName.STUDIO_PRO]: 'price_studio_pro' })
        expect(planPrice.priceIdForPlan(PlanName.AGENT_PRO)).toBe('price_agent_pro')
        expect(planPrice.planForPriceId('price_agent_pro')).toBe(PlanName.AGENT_PRO)
        expect(planPrice.planForPriceId('price_studio_pro')).toBe(PlanName.STUDIO_PRO)
        expect(planPrice.isConfigured()).toBe(true)
    })

    it('an UNKNOWN price maps to no plan — add-on line items must not look like a tier', () => {
        configure({ [PlanName.AGENT_PRO]: 'price_agent_pro' })
        // e.g. the active-flow / ai-credit add-on prices.
        expect(planPrice.planForPriceId('price_active_flow_addon')).toBeUndefined()
        expect(planPrice.planForPriceId(null)).toBeUndefined()
        expect(planPrice.planForPriceId(undefined)).toBeUndefined()
    })

    it('ignores a non-billable / unknown plan key — a typo cannot mint a phantom tier', () => {
        configure({ not_a_real_plan: 'price_x', [PlanName.AGENT_FREE]: 'price_free' })
        expect(planPrice.planForPriceId('price_x')).toBeUndefined()
        // AGENT_FREE is a real plan but is NOT billable — it must never be purchasable.
        expect(planPrice.planForPriceId('price_free')).toBeUndefined()
        expect(planPrice.priceIdForPlan(PlanName.AGENT_FREE)).toBeUndefined()
    })

    it('a duplicate price id does not silently map to two plans', () => {
        configure({ [PlanName.AGENT_PRO]: 'dup', [PlanName.STUDIO_PRO]: 'dup' })
        // First wins; the second is ignored rather than overwriting (which would reconcile the wrong tier).
        expect(planPrice.planForPriceId('dup')).toBe(PlanName.AGENT_PRO)
    })

    it('no config / malformed JSON → nothing is purchasable (fails safe, never throws)', () => {
        systemGet.mockReturnValue(undefined)
        planPrice._reset()
        expect(planPrice.isConfigured()).toBe(false)
        expect(planPrice.planForPriceId('anything')).toBeUndefined()

        systemGet.mockReturnValue('{not json')
        planPrice._reset()
        expect(planPrice.isConfigured()).toBe(false)
        expect(planPrice.priceIdForPlan(PlanName.AGENT_PRO)).toBeUndefined()
    })
})
