import { AGENT_CAPS_ENTERPRISE, AGENT_CAPS_PRO, AgentUsageMetric, agentUsage, UNLIMITED_CAP } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('../../../../src/app/database/database-connection', () => ({
    databaseConnection: () => ({ query: queryMock }),
}))

vi.mock('@intelblocks/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@intelblocks/shared')>()
    return { ...actual, ibId: () => 'test-id-000000000000000' }
})

const { browserAgentUsage } = await import('../../../../src/app/browser-agent/usage/browser-agent-usage.service')
const { browserAgentPlan } = await import('../../../../src/app/browser-agent/usage/browser-agent-plan.service')

const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never
const svc = () => browserAgentUsage(log)
const PID = 'plat-1'

beforeEach(() => {
    queryMock.mockReset()
})

describe('agentUsage helpers (shared)', () => {
    it('maps metered tools to metrics and leaves read/free tools unmetered', () => {
        expect(agentUsage.metricForToolName('click')).toBe(AgentUsageMetric.ACTIONS)
        expect(agentUsage.metricForToolName('submitForm')).toBe(AgentUsageMetric.ACTIONS)
        expect(agentUsage.metricForToolName('fetchUrl')).toBe(AgentUsageMetric.RESEARCH)
        expect(agentUsage.metricForToolName('compileReport')).toBe(AgentUsageMetric.RESEARCH)
        expect(agentUsage.metricForToolName('editFile')).toBe(AgentUsageMetric.FILE_OPS)
        expect(agentUsage.metricForToolName('remember')).toBe(AgentUsageMetric.MEMORY_OPS)
        // free/read tools are never metered here
        expect(agentUsage.metricForToolName('readPage')).toBeUndefined()
        expect(agentUsage.metricForToolName('summarise')).toBeUndefined()
        expect(agentUsage.metricForToolName('listRoutines')).toBeUndefined()
        expect(agentUsage.metricForToolName('runRoutine')).toBeUndefined()
    })

    it('formats the monthly period as YYYY-MM (UTC)', () => {
        expect(agentUsage.usagePeriod(new Date(Date.UTC(2026, 6, 14)))).toBe('2026-07')
        expect(agentUsage.usagePeriod(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01')
        expect(agentUsage.usagePeriod(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12')
    })

    it('treats -1 and null/undefined as unlimited', () => {
        expect(agentUsage.isUnlimitedCap(UNLIMITED_CAP)).toBe(true)
        expect(agentUsage.isUnlimitedCap(null)).toBe(true)
        expect(agentUsage.isUnlimitedCap(undefined)).toBe(true)
        expect(agentUsage.isUnlimitedCap(0)).toBe(false)
        expect(agentUsage.isUnlimitedCap(100)).toBe(false)
    })
})

describe('browserAgentUsage.increment', () => {
    it('runs the atomic upsert and returns the new count', async () => {
        queryMock.mockResolvedValueOnce([{ count: 5 }])
        const n = await svc().increment(PID, AgentUsageMetric.ACTIONS)
        expect(n).toBe(5)
        const [sql, params] = queryMock.mock.calls[0]
        expect(sql).toContain('INSERT INTO "browser_agent_usage_counter"')
        expect(sql).toContain('ON CONFLICT ("platformId", "period", "metric")')
        expect(sql).toContain('"count" = "browser_agent_usage_counter"."count" + 1')
        expect(params[1]).toBe(PID)
        expect(params[3]).toBe(AgentUsageMetric.ACTIONS)
    })
})

describe('browserAgentUsage.meter — enforcement', () => {
    it('refuses when the feature is not on the plan (cap = 0) without touching the DB', async () => {
        await expect(svc().meter({ platformId: PID, metric: AgentUsageMetric.RESEARCH, cap: 0 }))
            .rejects.toMatchObject({ error: { code: 'FEATURE_DISABLED' } })
        expect(queryMock).not.toHaveBeenCalled()
    })

    it('allows and increments when under the cap', async () => {
        queryMock
            .mockResolvedValueOnce([{ count: 3 }]) // currentCount
            .mockResolvedValueOnce([{ count: 4 }]) // increment
        await svc().meter({ platformId: PID, metric: AgentUsageMetric.ACTIONS, cap: 10 })
        expect(queryMock).toHaveBeenCalledTimes(2)
        expect(queryMock.mock.calls[0][0]).toContain('SELECT "count"')
        expect(queryMock.mock.calls[1][0]).toContain('INSERT INTO')
    })

    it('refuses at the cap (Nth+1 is denied, not counted)', async () => {
        queryMock.mockResolvedValueOnce([{ count: 10 }]) // currentCount == cap
        await expect(svc().meter({ platformId: PID, metric: AgentUsageMetric.ACTIONS, cap: 10 }))
            .rejects.toMatchObject({ error: { code: 'FEATURE_DISABLED' } })
        // only the SELECT ran — no increment past the cap
        expect(queryMock).toHaveBeenCalledTimes(1)
    })

    it('unlimited (-1) increments without a cap check', async () => {
        queryMock.mockResolvedValueOnce([{ count: 9999 }]) // increment only
        await svc().meter({ platformId: PID, metric: AgentUsageMetric.ACTIONS, cap: UNLIMITED_CAP })
        expect(queryMock).toHaveBeenCalledTimes(1)
        expect(queryMock.mock.calls[0][0]).toContain('INSERT INTO')
    })

    it('fails OPEN on a metering DB error (never blocks legit work)', async () => {
        queryMock.mockRejectedValueOnce(new Error('db down'))
        await expect(svc().meter({ platformId: PID, metric: AgentUsageMetric.ACTIONS, cap: 10 }))
            .resolves.toBeUndefined()
        expect(log.warn).toHaveBeenCalled()
    })
})

describe('browserAgentUsage.currentUsage', () => {
    it('returns all six metrics zero-filled, overlaid with actual counts', async () => {
        queryMock.mockResolvedValueOnce([
            { metric: 'ACTIONS', count: 12 },
            { metric: 'RESEARCH', count: 3 },
        ])
        const usage = await svc().currentUsage(PID)
        expect(usage).toMatchObject({ ACTIONS: 12, RESEARCH: 3, FILE_OPS: 0, ROUTINE_RUNS: 0, QUICK_TOOLS: 0, MEMORY_OPS: 0 })
    })
})

/**
 * capsForPlatform now reads the platform's ENTITLEMENTS from the plan row (`agentCaps`, gated by
 * `browserAgentEnabled`) rather than guessing a tier from the plan NAME. The name heuristic was the
 * interim seam; the plan columns are the real source of truth (SUBSCRIPTION_PLANS_PROPOSAL §7.2/§8).
 * Full coverage of the resolver's contract lives in test/unit/app/billing/plan-resolution.test.ts;
 * these cases pin the behaviour the metering layer depends on.
 */
describe('browserAgentPlan.capsForPlatform', () => {
    async function capsFor(row: { browserAgentEnabled: boolean | null, agentCaps: unknown }) {
        queryMock.mockResolvedValueOnce([row])
        return browserAgentPlan(log).capsForPlatform(PID)
    }

    it('grants nothing when the browser agent is not on the plan — even if caps are present', async () => {
        const caps = await capsFor({ browserAgentEnabled: false, agentCaps: AGENT_CAPS_PRO })
        expect(caps.monthly.ACTIONS).toBe(0)
        expect(caps.maxBatchRows).toBe(0)
        expect(caps.reasoningAllowed).toBe(false)
    })

    it('returns the plan\'s stored caps when the agent door is open', async () => {
        const caps = await capsFor({ browserAgentEnabled: true, agentCaps: AGENT_CAPS_PRO })
        expect(caps.reasoningAllowed).toBe(true)
        expect(caps.maxBatchRows).toBeGreaterThan(0)
        expect(caps.maxSchedules).toBeGreaterThan(0)
    })

    it('an enterprise plan carries unlimited monthly caps', async () => {
        const caps = await capsFor({ browserAgentEnabled: true, agentCaps: AGENT_CAPS_ENTERPRISE })
        expect(caps.monthly.ACTIONS).toBe(UNLIMITED_CAP)
        expect(caps.maxBatchRows).toBeGreaterThan(0)
    })

    it('grants nothing when the plan carries no caps (never infers an entitlement)', async () => {
        const caps = await capsFor({ browserAgentEnabled: true, agentCaps: null })
        expect(caps.monthly.ACTIONS).toBe(0)
        expect(caps.maxBatchRows).toBe(0)
        expect(caps.reasoningAllowed).toBe(false)
    })

    it('on a DB fault: privileges fail CLOSED, but metered work is not falsely denied', async () => {
        queryMock.mockRejectedValueOnce(new Error('db down'))
        const caps = await browserAgentPlan(log).capsForPlatform(PID)
        // Never over-grant a privilege because of a blip...
        expect(caps.reasoningAllowed).toBe(false)
        expect(caps.maxBatchRows).toBe(0)
        // ...but never tell a paying customer their feature "isn't on their plan" either: an
        // unlimited metric cap lets the (fail-open) meter allow and record the action.
        expect(caps.monthly.ACTIONS).toBe(UNLIMITED_CAP)
    })
})
