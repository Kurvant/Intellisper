import { describe, expect, it, vi } from 'vitest'

/**
 * MEMORY PRIVACY — the three-condition admin gate.
 *
 * This suite guards the product's hardest privacy promise:
 *
 *   A platform admin may see a member's memory fact ONLY when ALL THREE hold:
 *     1. platform_plan.agentSharingUnlocked = true   (admin unlocked the capability)
 *     2. user.agentSharingOptIn            = true   (the member opted in)
 *     3. memory_fact.visibility            = SHARED (the member marked THAT fact)
 *
 *   A fact the member left PRIVATE is NEVER admin-visible — not even when that member has opted in.
 *   Opting in does not surrender your memory; it only ever exposes the facts you individually marked.
 *
 * These tests assert against the SQL the service actually issues, because the gate IS the SQL. A
 * behavioural test with a fake repository would happily pass while the real predicate was broken.
 * If someone later relaxes the predicate — drops a condition, turns an AND into an OR, or adds an
 * escape parameter — these fail loudly.
 */

const query = vi.fn().mockResolvedValue([])
vi.mock('../../../../src/app/database/database-connection', () => ({
    databaseConnection: () => ({ query }),
}))
vi.mock('../../../../src/app/browser-agent/model-provider/model-provider.service', () => ({
    browserAgentModelProvider: () => ({ embed: async () => new Array(1536).fill(0.1) }),
}))

import { browserAgentMemory } from '../../../../src/app/browser-agent/memory/browser-agent-memory.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
/** Collapse whitespace so assertions are robust to SQL formatting. */
const sqlOf = (call: unknown[]): string => String(call[0]).replace(/\s+/g, ' ')
const allSql = (): string[] => query.mock.calls.map(sqlOf)

describe('admin memory read — the three-condition gate', () => {
    async function runAdminList(): Promise<string[]> {
        query.mockClear()
        await browserAgentMemory(log).adminListFacts('platform1', {})
        return allSql().filter((s) => s.includes('browser_agent_memory_fact'))
    }

    it('requires ALL THREE conditions in the same predicate — unlock AND opt-in AND fact SHARED', async () => {
        const stmts = await runAdminList()
        expect(stmts.length).toBeGreaterThan(0)
        for (const sql of stmts) {
            expect(sql, 'must require the platform unlock').toContain('pp."agentSharingUnlocked" = true')
            expect(sql, 'must require the owner opt-in').toContain('u."agentSharingOptIn" = true')
            expect(sql, 'must require the per-fact SHARED mark').toContain("f.visibility = 'SHARED'")
            // The three must be ANDed together, never ORed — an OR would let any one of them alone
            // expose a member's private fact.
            expect(sql).toMatch(/f\.visibility = 'SHARED'\s+AND\s+u\."agentSharingOptIn" = true\s+AND\s+pp\."agentSharingUnlocked" = true/)
        }
    })

    it('scopes every admin statement to the caller\'s own platform', async () => {
        const stmts = await runAdminList()
        for (const sql of stmts) {
            expect(sql).toContain('f."platformId" = $1')
        }
        for (const call of query.mock.calls) {
            expect((call[1] as unknown[])[0], 'platformId must be the first bound param').toBe('platform1')
        }
    })

    it('never returns soft-deleted facts', async () => {
        const stmts = await runAdminList()
        for (const sql of stmts) {
            expect(sql).toContain('f."deletedAt" IS NULL')
        }
    })

    it('only USER-scoped facts pass through the gate; org-owned scopes are the separate branch', async () => {
        const stmts = await runAdminList()
        for (const sql of stmts) {
            // Org-owned memory is admin-visible by design...
            expect(sql).toContain("f.scope IN ('PLATFORM', 'FLOW')")
            // ...and personal memory is only ever reachable through the gated branch.
            expect(sql).toMatch(/OR \(\s*f\.scope = 'USER'/)
        }
    })

    it('exposes NO parameter that can weaken the gate (search/scope/paging are additive only)', async () => {
        query.mockClear()
        // A caller doing everything it can to widen the read.
        await browserAgentMemory(log).adminListFacts('platform1', {
            scope: 'USER' as never,
            search: "'; --",
            page: 1,
            limit: 100,
        })
        const stmts = allSql().filter((s) => s.includes('browser_agent_memory_fact'))
        for (const sql of stmts) {
            expect(sql).toContain('pp."agentSharingUnlocked" = true')
            expect(sql).toContain('u."agentSharingOptIn" = true')
            expect(sql).toContain("f.visibility = 'SHARED'")
        }
        // The hostile search string must be BOUND, never inlined.
        for (const sql of stmts) expect(sql).not.toContain("'; --")
        expect(query.mock.calls.some((c) => (c[1] as unknown[]).includes("%'; --%"))).toBe(true)
    })

    it('the admin overview counts only facts that pass the full gate (no teaser counts)', async () => {
        query.mockClear()
        query.mockResolvedValueOnce([{}])
        await browserAgentMemory(log).adminOverview('platform1')
        const sql = sqlOf(query.mock.calls[0])
        // The sharedUserFactCount subquery carries all three conditions too, so the number an admin
        // sees always equals what they can actually open.
        expect(sql).toContain("f.visibility = 'SHARED'")
        expect(sql).toContain('u."agentSharingOptIn" = true')
        expect(sql).toContain('pp."agentSharingUnlocked" = true')
    })
})

describe('member memory reads — a USER scope can only ever be your own', () => {
    it('lists USER facts filtered by BOTH platformId and userId', async () => {
        query.mockClear()
        await browserAgentMemory(log).listFacts({ userId: 'user1', platformId: 'platform1' }, {})
        const stmts = allSql()
        expect(stmts.length).toBeGreaterThan(0)
        for (const sql of stmts) {
            expect(sql).toContain('"platformId" = $1')
            expect(sql).toContain('"userId" = $2')
            expect(sql).toContain('"scope" = \'USER\'')
        }
        for (const call of query.mock.calls) {
            expect((call[1] as unknown[]).slice(0, 2)).toEqual(['platform1', 'user1'])
        }
    })

    it('org (PLATFORM) memory is NOT filtered by userId — it is team-owned, not author-owned', async () => {
        query.mockClear()
        await browserAgentMemory(log).listFacts({ userId: 'user1', platformId: 'platform1' }, {
            target: { scope: 'PLATFORM' as never },
        })
        for (const sql of allSql()) {
            expect(sql).toContain('"scope" = \'PLATFORM\'')
            expect(sql).not.toContain('"userId" =')
        }
    })

    it('FLOW memory is scoped to the platform AND the flow', async () => {
        query.mockClear()
        await browserAgentMemory(log).listFacts({ userId: 'user1', platformId: 'platform1' }, {
            target: { scope: 'FLOW' as never, flowId: 'flow1' },
        })
        for (const sql of allSql()) {
            expect(sql).toContain('"scope" = \'FLOW\'')
            expect(sql).toContain('"flowId" = $2')
        }
    })

    it('refuses a FLOW target with no flowId rather than silently widening to the whole platform', async () => {
        await expect(
            browserAgentMemory(log).listFacts({ userId: 'user1', platformId: 'platform1' }, {
                target: { scope: 'FLOW' as never },
            }),
        ).rejects.toThrow()
    })
})

/**
 * `remember` short-circuits when pgvector is absent (graceful degradation), and the probe reads the
 * DB — which our mock answers with []. Simulate the extension being installed so the write paths
 * actually reach their SQL; the probe is cached, so it is reset per test.
 */
function withVectorAvailable(): void {
    browserAgentMemory(log)._resetVectorProbe()
    query.mockResolvedValueOnce([{ installed: true }])
}

describe('per-fact visibility — the member\'s veto', () => {
    it('a member can only ever change the mark on their OWN user-scoped fact', async () => {
        query.mockClear()
        query.mockResolvedValueOnce([[], 1])
        await browserAgentMemory(log).setVisibility({ userId: 'user1', platformId: 'platform1' }, 'fact1', 'SHARED' as never)
        const sql = sqlOf(query.mock.calls[0])
        expect(sql).toContain('"platformId" = $3')
        expect(sql).toContain('"userId" = $4')
        expect(sql).toContain("scope = 'USER'")
        expect(query.mock.calls[0][1]).toEqual(['SHARED', 'fact1', 'platform1', 'user1'])
    })

    it('new facts are born PRIVATE — visibility is never set on insert', async () => {
        query.mockClear()
        withVectorAvailable()
        query.mockResolvedValueOnce([])   // dedupe probe: no near fact
        await browserAgentMemory(log).remember({ userId: 'user1', platformId: 'platform1' }, 'I prefer dark mode', 'PREFERENCE' as never, 'EXPLICIT' as never)
        const insert = allSql().find((s) => s.includes('INSERT INTO browser_agent_memory_fact'))
        expect(insert).toBeDefined()
        // Not naming the column means it takes the schema default, PRIVATE. If a future edit ever
        // inserts a visibility, this fails — which is the point.
        expect(insert).not.toContain('visibility')
    })
})

describe('dedupe cannot widen a fact\'s audience', () => {
    it('dedupes within the target scope only (never folding a personal fact into org memory)', async () => {
        query.mockClear()
        withVectorAvailable()
        query.mockResolvedValueOnce([])
        await browserAgentMemory(log).remember({ userId: 'user1', platformId: 'platform1' }, 'a fact', 'NOTE' as never, 'AUTO' as never, 'PLATFORM' as never)
        const probe = allSql().find((s) => s.includes('SELECT id, (embedding <=>'))
        expect(probe).toBeDefined()
        // The org-scope probe must look only at org rows...
        expect(probe).toContain('"scope" = \'PLATFORM\'')
        // ...and must not collapse into some other user's personal row.
        expect(probe).not.toContain('"userId" =')
    })
})
