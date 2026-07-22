import {
    AGENT_CAPS_ENTERPRISE,
    AGENT_CAPS_FREE,
    AGENT_CAPS_NONE,
    AGENT_CAPS_PRO,
    AGENT_CAPS_STARTER,
    AGENT_FREE_PLAN,
    AGENT_PRO_PLAN,
    AGENT_STARTER_PLAN,
    AgentUsageMetric,
    BILLABLE_PLANS,
    COMPLETE_FREE_PLAN,
    COMPLETE_PRO_PLAN,
    COMPLETE_STARTER_PLAN,
    OPEN_SOURCE_PLAN,
    PLAN_LIMITS_BY_NAME,
    PLAN_MONTHLY_PRICE_USD,
    PlanName,
    planLimitsForName,
    STANDARD_CLOUD_PLAN,
    STUDIO_FREE_PLAN,
    STUDIO_PRO_PLAN,
    STUDIO_STARTER_PLAN,
    TEAM_AGENT_PLAN,
    TEAM_COMPLETE_PLAN,
    TEAM_STUDIO_PLAN,
    UNLIMITED_CAP,
} from '@intelblocks/shared'
import { describe, expect, it } from 'vitest'

/**
 * Subscription-plan constants (SUBSCRIPTION_PLANS_PROPOSAL §3/§5).
 *
 * These are BILLING facts: a wrong value here silently over-grants capacity (revenue leak) or
 * under-grants a paying customer (support burden). The tests pin the exact entitlement each tier
 * sells, the product-door invariants, and the backward-compatibility guarantees.
 */

const AGENT_TIERS = [AGENT_FREE_PLAN, AGENT_STARTER_PLAN, AGENT_PRO_PLAN]
const STUDIO_TIERS = [STUDIO_FREE_PLAN, STUDIO_STARTER_PLAN, STUDIO_PRO_PLAN]
const COMPLETE_TIERS = [COMPLETE_FREE_PLAN, COMPLETE_STARTER_PLAN, COMPLETE_PRO_PLAN]

describe('product doors — which plan opens which product', () => {
    it('every AGENT tier opens the agent door and grants agent caps', () => {
        for (const plan of AGENT_TIERS) {
            expect(plan.browserAgentEnabled, `${plan.plan} must open the agent`).toBe(true)
            expect(plan.agentCaps, `${plan.plan} must carry caps`).not.toBeNull()
        }
    })

    it('every STUDIO tier keeps the agent door CLOSED (it is not sold on that plan)', () => {
        for (const plan of STUDIO_TIERS) {
            expect(plan.browserAgentEnabled, `${plan.plan} must not open the agent`).toBe(false)
            expect(plan.agentCaps, `${plan.plan} must grant no agent capacity`).toEqual(AGENT_CAPS_NONE)
        }
    })

    it('every COMPLETE tier opens BOTH doors (agent caps + active flows)', () => {
        for (const plan of COMPLETE_TIERS) {
            expect(plan.browserAgentEnabled, `${plan.plan} must open the agent`).toBe(true)
            expect(plan.agentCaps).not.toEqual(AGENT_CAPS_NONE)
            expect(plan.activeFlowsLimit ?? 0, `${plan.plan} must include Studio flows`).toBeGreaterThan(0)
        }
    })

    it('agent-only tiers sell NO active flows (they are not the Studio product)', () => {
        for (const plan of AGENT_TIERS) {
            expect(plan.activeFlowsLimit ?? 0).toBe(0)
        }
        expect(TEAM_AGENT_PLAN.activeFlowsLimit ?? 0).toBe(0)
    })

    it('studio-only team tier keeps the agent closed; team complete opens both', () => {
        expect(TEAM_STUDIO_PLAN.browserAgentEnabled).toBe(false)
        expect(TEAM_COMPLETE_PLAN.browserAgentEnabled).toBe(true)
        expect((TEAM_COMPLETE_PLAN.activeFlowsLimit ?? 0)).toBeGreaterThan(0)
    })
})

describe('tier ladder — caps and credits increase monotonically', () => {
    it('agent caps ladder: free < starter < pro on the metered dimensions', () => {
        const free = AGENT_CAPS_FREE.monthly
        const starter = AGENT_CAPS_STARTER.monthly
        const pro = AGENT_CAPS_PRO.monthly
        for (const metric of Object.values(AgentUsageMetric)) {
            expect(starter[metric], `${metric} starter > free`).toBeGreaterThan(free[metric])
            expect(pro[metric], `${metric} pro > starter`).toBeGreaterThan(starter[metric])
        }
    })

    it('AI credits increase with tier within each product line', () => {
        expect(AGENT_STARTER_PLAN.includedAiCredits).toBeGreaterThan(AGENT_FREE_PLAN.includedAiCredits)
        expect(AGENT_PRO_PLAN.includedAiCredits).toBeGreaterThan(AGENT_STARTER_PLAN.includedAiCredits)
        expect(STUDIO_PRO_PLAN.includedAiCredits).toBeGreaterThan(STUDIO_STARTER_PLAN.includedAiCredits)
        expect(COMPLETE_PRO_PLAN.includedAiCredits).toBeGreaterThan(COMPLETE_STARTER_PLAN.includedAiCredits)
    })

    it('Complete pools MORE credits than either single product at the same tier (the bundle promise)', () => {
        expect(COMPLETE_PRO_PLAN.includedAiCredits).toBeGreaterThan(AGENT_PRO_PLAN.includedAiCredits)
        expect(COMPLETE_PRO_PLAN.includedAiCredits).toBeGreaterThan(STUDIO_PRO_PLAN.includedAiCredits)
    })

    it('active flows increase with the Studio tier', () => {
        expect((STUDIO_STARTER_PLAN.activeFlowsLimit ?? 0)).toBeGreaterThan(STUDIO_FREE_PLAN.activeFlowsLimit ?? 0)
        expect((STUDIO_PRO_PLAN.activeFlowsLimit ?? 0)).toBeGreaterThan(STUDIO_STARTER_PLAN.activeFlowsLimit ?? 0)
    })
})

describe('paid-only capabilities are not given away', () => {
    it('reasoning (Opus) is PRO+ only — never on free/starter', () => {
        expect(AGENT_CAPS_FREE.reasoningAllowed).toBe(false)
        expect(AGENT_CAPS_STARTER.reasoningAllowed).toBe(false)
        expect(AGENT_CAPS_PRO.reasoningAllowed).toBe(true)
        expect(AGENT_CAPS_NONE.reasoningAllowed).toBe(false)
    })

    it('batch + schedules are not included on Free (the cheap-scale lever starts at Starter)', () => {
        expect(AGENT_CAPS_FREE.maxBatchRows).toBe(0)
        expect(AGENT_CAPS_FREE.maxSchedules).toBe(0)
        expect(AGENT_CAPS_STARTER.maxBatchRows).toBeGreaterThan(0)
        expect(AGENT_CAPS_STARTER.maxSchedules).toBeGreaterThan(0)
    })

    it('AGENT_CAPS_NONE grants literally nothing (the closed door)', () => {
        for (const metric of Object.values(AgentUsageMetric)) {
            expect(AGENT_CAPS_NONE.monthly[metric]).toBe(0)
        }
        expect(AGENT_CAPS_NONE.maxBatchRows).toBe(0)
        expect(AGENT_CAPS_NONE.maxConcurrentRows).toBe(0)
        expect(AGENT_CAPS_NONE.maxSchedules).toBe(0)
    })

    it('BYO AI keys (aiProvidersEnabled) is Enterprise-edition ONLY — no cloud tier grants it', () => {
        for (const plan of Object.values(PLAN_LIMITS_BY_NAME)) {
            expect(plan!.aiProvidersEnabled, `${plan!.plan} must not grant BYO keys`).toBe(false)
        }
        expect(OPEN_SOURCE_PLAN.aiProvidersEnabled).toBe(true)
    })

    it('governance flags (SSO/SCIM/secret-managers) are off on every cloud tier', () => {
        for (const plan of Object.values(PLAN_LIMITS_BY_NAME)) {
            expect(plan!.ssoEnabled, `${plan!.plan} sso`).toBe(false)
            expect(plan!.scimEnabled, `${plan!.plan} scim`).toBe(false)
            expect(plan!.secretManagersEnabled, `${plan!.plan} secret managers`).toBe(false)
        }
    })

    it('team tiers unlock RBAC; individual tiers do not', () => {
        for (const plan of [...AGENT_TIERS, ...STUDIO_TIERS, ...COMPLETE_TIERS]) {
            expect(plan.projectRolesEnabled, `${plan.plan} must not grant RBAC`).toBe(false)
        }
        for (const plan of [TEAM_AGENT_PLAN, TEAM_STUDIO_PLAN, TEAM_COMPLETE_PLAN]) {
            expect(plan.projectRolesEnabled, `${plan.plan} grants RBAC`).toBe(true)
        }
    })

    it('audit logs are Team Complete only (per §5)', () => {
        expect(TEAM_COMPLETE_PLAN.auditLogEnabled).toBe(true)
        expect(TEAM_AGENT_PLAN.auditLogEnabled).toBe(false)
        expect(TEAM_STUDIO_PLAN.auditLogEnabled).toBe(false)
    })
})

describe('enterprise edition — unlimited by contract (§3.3)', () => {
    it('OPEN_SOURCE_PLAN opens the agent with unlimited monthly caps', () => {
        expect(OPEN_SOURCE_PLAN.browserAgentEnabled).toBe(true)
        expect(OPEN_SOURCE_PLAN.agentCaps).toEqual(AGENT_CAPS_ENTERPRISE)
        for (const metric of Object.values(AgentUsageMetric)) {
            expect(AGENT_CAPS_ENTERPRISE.monthly[metric]).toBe(UNLIMITED_CAP)
        }
        expect(AGENT_CAPS_ENTERPRISE.reasoningAllowed).toBe(true)
        // Memory's enterprise entitlement is asserted in the memory suite — it is no longer a field
        // of the agent's caps.
    })

    it('sharing is NEVER plan-granted — it is an admin switch', () => {
        for (const plan of [...Object.values(PLAN_LIMITS_BY_NAME), OPEN_SOURCE_PLAN]) {
            expect(plan!.agentSharingUnlocked, `${plan!.plan ?? 'open-source'} must not auto-unlock sharing`).toBe(false)
        }
    })
})

describe('backward compatibility — existing platforms are untouched', () => {
    it('the legacy STANDARD tier keeps the agent CLOSED and carries no caps', () => {
        expect(STANDARD_CLOUD_PLAN.browserAgentEnabled).toBe(false)
        expect(STANDARD_CLOUD_PLAN.agentCaps).toBeNull()
        // Its Studio entitlements are unchanged from before the rollout.
        expect(STANDARD_CLOUD_PLAN.activeFlowsLimit).toBe(10)
        expect(STANDARD_CLOUD_PLAN.includedAiCredits).toBe(200)
    })
})

describe('planLimitsForName — the single tier→entitlements resolution', () => {
    it('resolves every billable plan to its own constant', () => {
        expect(planLimitsForName(PlanName.AGENT_PRO)).toBe(AGENT_PRO_PLAN)
        expect(planLimitsForName(PlanName.STUDIO_PRO)).toBe(STUDIO_PRO_PLAN)
        expect(planLimitsForName(PlanName.COMPLETE_PRO)).toBe(COMPLETE_PRO_PLAN)
        expect(planLimitsForName(PlanName.TEAM_COMPLETE)).toBe(TEAM_COMPLETE_PLAN)
    })

    it('an unknown or missing plan falls back to STANDARD (never to a paid tier)', () => {
        expect(planLimitsForName(null)).toBe(STANDARD_CLOUD_PLAN)
        expect(planLimitsForName(undefined)).toBe(STANDARD_CLOUD_PLAN)
        expect(planLimitsForName('some_plan_that_does_not_exist')).toBe(STANDARD_CLOUD_PLAN)
        // The critical property: a typo can never hand out an agent/paid entitlement.
        expect(planLimitsForName('agent_pro_typo').browserAgentEnabled).toBe(false)
    })

    it('every tier in the map round-trips to the same plan name it is keyed by', () => {
        for (const [name, plan] of Object.entries(PLAN_LIMITS_BY_NAME)) {
            expect(plan!.plan, 'a plan constant must not be filed under the wrong name').toBe(name)
        }
    })
})

describe('pricing table — billable plans', () => {
    it('every billable plan has a price, and no free tier is billable', () => {
        expect(BILLABLE_PLANS.length).toBeGreaterThan(0)
        for (const plan of BILLABLE_PLANS) {
            expect(PLAN_MONTHLY_PRICE_USD[plan], `${plan} needs a price`).toBeGreaterThan(0)
        }
        for (const free of [PlanName.AGENT_FREE, PlanName.STUDIO_FREE, PlanName.COMPLETE_FREE]) {
            expect(BILLABLE_PLANS).not.toContain(free)
        }
    })

    it('the Complete bundle is cheaper than buying both products separately (§3.1c)', () => {
        const agentPro = PLAN_MONTHLY_PRICE_USD[PlanName.AGENT_PRO]!
        const studioPro = PLAN_MONTHLY_PRICE_USD[PlanName.STUDIO_PRO]!
        const completePro = PLAN_MONTHLY_PRICE_USD[PlanName.COMPLETE_PRO]!
        expect(completePro).toBeLessThan(agentPro + studioPro)
    })

    it('every billable plan actually exists in the entitlements map', () => {
        for (const plan of BILLABLE_PLANS) {
            expect(PLAN_LIMITS_BY_NAME[plan], `${plan} is billable but has no entitlements`).toBeDefined()
        }
    })
})
