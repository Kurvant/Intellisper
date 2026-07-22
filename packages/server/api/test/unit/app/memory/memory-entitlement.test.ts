import {
    AGENT_CAPS_FREE,
    AGENT_CAPS_NONE,
    AGENT_PRO_PLAN,
    AGENT_STARTER_PLAN,
    COMPLETE_FREE_PLAN,
    MEMORY_CAPS_ENTERPRISE,
    MEMORY_CAPS_NONE,
    MEMORY_CAPS_PRO,
    MEMORY_CAPS_STARTER,
    MEMORY_CAPS_TEAM,
    MEMORY_UNLIMITED_CAP,
    OPEN_SOURCE_PLAN,
    STUDIO_FREE_PLAN,
    STUDIO_PRO_PLAN,
    STUDIO_STARTER_PLAN,
    TEAM_STUDIO_PLAN,
} from '@intelblocks/shared'
import { describe, expect, it, vi } from 'vitest'

/**
 * MEMORY ENTITLEMENT — decoupled from the browser agent.
 *
 * Memory is a cross-product capability: the agent uses personal memory (USER scope) and Studio uses
 * org/flow memory (PLATFORM/FLOW). It was previously nested inside `agentCaps`, which made it
 * unusable AND unsellable on a Studio-only plan — the agent door being shut denied memory outright.
 *
 * These tests pin the two halves of the fix:
 *   1. the entitlement matrix per plan — crucially, that STUDIO tiers sell memory with NO agent; and
 *   2. the resolver's independence: it must never consult `browserAgentEnabled`, and must fail
 *      CLOSED on anything it cannot positively verify.
 */

const query = vi.fn()
vi.mock('../../../../src/app/database/database-connection', () => ({
    databaseConnection: () => ({ query }),
}))

import { memoryPlan } from '../../../../src/app/memory/memory-plan.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

describe('entitlement matrix — memory is sold to BOTH products', () => {
    it('STUDIO tiers sell memory WITHOUT the agent — the defect this fix exists for', () => {
        for (const [name, plan] of [
            ['STUDIO_STARTER', STUDIO_STARTER_PLAN],
            ['STUDIO_PRO', STUDIO_PRO_PLAN],
            ['TEAM_STUDIO', TEAM_STUDIO_PLAN],
        ] as const) {
            expect(plan.memoryCaps?.enabled, `${name} must include memory`).toBe(true)
            // The whole point: memory is on while the agent door stays shut.
            expect(plan.browserAgentEnabled, `${name} must NOT include the agent`).toBe(false)
        }
    })

    it('AGENT paid tiers keep memory exactly as before (no regression)', () => {
        expect(AGENT_STARTER_PLAN.memoryCaps).toEqual(MEMORY_CAPS_STARTER)
        expect(AGENT_PRO_PLAN.memoryCaps).toEqual(MEMORY_CAPS_PRO)
    })

    it('FREE tiers keep memory OFF on both products, and the metered op cap agrees', () => {
        expect(STUDIO_FREE_PLAN.memoryCaps).toEqual(MEMORY_CAPS_NONE)
        expect(COMPLETE_FREE_PLAN.memoryCaps).toEqual(MEMORY_CAPS_NONE)
        // A closed door must never be contradicted by a non-zero metered allowance.
        expect(AGENT_CAPS_FREE.monthly.MEMORY_OPS).toBe(0)
        expect(AGENT_CAPS_NONE.monthly.MEMORY_OPS).toBe(0)
    })

    it('self-hosted Enterprise ships memory unlimited (own keys, own DB)', () => {
        expect(OPEN_SOURCE_PLAN.memoryCaps).toEqual(MEMORY_CAPS_ENTERPRISE)
        expect(MEMORY_CAPS_ENTERPRISE.maxFacts).toBe(MEMORY_UNLIMITED_CAP)
    })

    it('the fact budget grows with tier (an upgrade never buys less)', () => {
        expect(MEMORY_CAPS_STARTER.maxFacts).toBeGreaterThan(MEMORY_CAPS_NONE.maxFacts)
        expect(MEMORY_CAPS_PRO.maxFacts).toBeGreaterThan(MEMORY_CAPS_STARTER.maxFacts)
        expect(MEMORY_CAPS_TEAM.maxFacts).toBeGreaterThan(MEMORY_CAPS_PRO.maxFacts)
    })

    it('no plan auto-unlocks admin sharing — it stays admin-set + user-opt-in', () => {
        for (const plan of [STUDIO_STARTER_PLAN, STUDIO_PRO_PLAN, TEAM_STUDIO_PLAN, OPEN_SOURCE_PLAN]) {
            expect(plan.agentSharingUnlocked).toBe(false)
        }
    })
})

describe('memoryPlan resolver — independent of the agent, fail-closed', () => {
    it('GRANTS memory to a platform with the agent door SHUT (the fix)', async () => {
        query.mockResolvedValueOnce([{ memoryCaps: MEMORY_CAPS_PRO }])
        expect(await memoryPlan(log).isEnabled({ platformId: 'p1' })).toBe(true)
    })

    it('never reads browserAgentEnabled — it is not even selected', async () => {
        query.mockClear()
        query.mockResolvedValueOnce([{ memoryCaps: MEMORY_CAPS_PRO }])
        await memoryPlan(log).capsForPlatform({ platformId: 'p1' })
        const sql = String(query.mock.calls[0][0])
        expect(sql).not.toContain('browserAgentEnabled')
        expect(sql).toContain('memoryCaps')
        expect(sql).toContain('"platformId" = $1')
    })

    it('DENIES when the plan has no memoryCaps', async () => {
        query.mockResolvedValueOnce([{ memoryCaps: null }])
        expect(await memoryPlan(log).isEnabled({ platformId: 'p1' })).toBe(false)
    })

    it('DENIES when there is no plan row', async () => {
        query.mockResolvedValueOnce([])
        expect(await memoryPlan(log).isEnabled({ platformId: 'p1' })).toBe(false)
    })

    it('DENIES a malformed blob (never infer an entitlement)', async () => {
        query.mockResolvedValueOnce([{ memoryCaps: { enabled: true } }])
        expect(await memoryPlan(log).isEnabled({ platformId: 'p1' })).toBe(false)
    })

    it('DENIES on a DB fault — privileges fail CLOSED', async () => {
        query.mockRejectedValueOnce(new Error('connection refused'))
        expect(await memoryPlan(log).isEnabled({ platformId: 'p1' })).toBe(false)
    })

    it('assertEnabled throws without memory and is silent with it', async () => {
        query.mockResolvedValueOnce([{ memoryCaps: MEMORY_CAPS_NONE }])
        await expect(memoryPlan(log).assertEnabled({ platformId: 'p1' })).rejects.toThrow()

        query.mockResolvedValueOnce([{ memoryCaps: MEMORY_CAPS_STARTER }])
        await expect(memoryPlan(log).assertEnabled({ platformId: 'p1' })).resolves.toBeUndefined()
    })
})

describe('stored-fact ceiling', () => {
    it('refuses a NEW fact at the ceiling', async () => {
        query.mockResolvedValueOnce([{ memoryCaps: { ...MEMORY_CAPS_PRO, maxFacts: 10 } }])
        query.mockResolvedValueOnce([{ used: 10 }])
        expect(await memoryPlan(log).canStoreMoreFacts({ platformId: 'p1', userId: 'u1' }))
            .toEqual({ allowed: false, used: 10, limit: 10 })
    })

    it('allows a new fact below the ceiling', async () => {
        query.mockResolvedValueOnce([{ memoryCaps: { ...MEMORY_CAPS_PRO, maxFacts: 10 } }])
        query.mockResolvedValueOnce([{ used: 9 }])
        expect((await memoryPlan(log).canStoreMoreFacts({ platformId: 'p1', userId: 'u1' })).allowed).toBe(true)
    })

    it('counts only the user\'s own live facts (per-user, ignoring deleted)', async () => {
        query.mockClear()
        query.mockResolvedValueOnce([{ memoryCaps: { ...MEMORY_CAPS_PRO, maxFacts: 10 } }])
        query.mockResolvedValueOnce([{ used: 1 }])
        await memoryPlan(log).canStoreMoreFacts({ platformId: 'p1', userId: 'u1' })
        const sql = String(query.mock.calls[1][0]).replace(/\s+/g, ' ')
        expect(sql).toContain('"platformId" = $1')
        expect(sql).toContain('"userId" = $2')
        expect(sql).toContain('"deletedAt" IS NULL')
        expect(query.mock.calls[1][1]).toEqual(['p1', 'u1'])
    })

    it('skips the count when unlimited (no needless query)', async () => {
        query.mockClear()
        query.mockResolvedValueOnce([{ memoryCaps: MEMORY_CAPS_ENTERPRISE }])
        expect((await memoryPlan(log).canStoreMoreFacts({ platformId: 'p1', userId: 'u1' })).allowed).toBe(true)
        expect(query.mock.calls.length).toBe(1)
    })

    it('refuses when memory is not on the plan at all', async () => {
        query.mockResolvedValueOnce([{ memoryCaps: MEMORY_CAPS_NONE }])
        expect((await memoryPlan(log).canStoreMoreFacts({ platformId: 'p1', userId: 'u1' })).allowed).toBe(false)
    })
})
