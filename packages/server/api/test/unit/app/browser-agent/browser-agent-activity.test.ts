import { IbEdition } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The three-tier agent-activity reads. The whole point of these tests is SCOPE ISOLATION — proving
 * no tier can read data it must not:
 *   - Tier 1 (user): reads are owner-filtered (platformId + userId).
 *   - Tier 2 (tenant admin): every query is bounded to the caller's OWN platformId (from the principal).
 *   - Tier 3 (operator): the gate denies wrong-key / non-cloud / no-key before any handler runs.
 */

// ── Capture what the service asks the DB for, so we can assert the scope predicates. ────────────────
const ownerFilterSpy = vi.fn()
const platformFilterSpy = vi.fn()

vi.mock('../../../../src/app/browser-agent/scope/agent-scope', () => ({
    agentScope: {
        ownerFilter: (ctx: { platformId: string, userId: string }) => {
            ownerFilterSpy(ctx); return { platformId: ctx.platformId, userId: ctx.userId } 
        },
        platformFilter: (ctx: { platformId: string }) => {
            platformFilterSpy(ctx); return { platformId: ctx.platformId } 
        },
    },
}))

// A chainable query-builder stub that records the WHERE params it was given.
const whereParams: Record<string, unknown>[] = []
function makeQb(rawResult: unknown[]) {
    const qb: Record<string, unknown> = {}
    for (const m of ['leftJoin', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take', 'limit', 'select', 'addSelect', 'groupBy', 'addGroupBy', 'from']) {
        qb[m] = (...args: unknown[]) => {
            if ((m === 'where' || m === 'andWhere') && typeof args[1] === 'object' && args[1]) whereParams.push(args[1] as Record<string, unknown>)
            return qb
        }
    }
    qb.getRawMany = async () => rawResult
    qb.getRawOne = async () => rawResult[0] ?? {}
    qb.getManyAndCount = async () => [rawResult, rawResult.length]
    return qb
}

const countBySpy = vi.fn().mockResolvedValue(0)
const managerQb = makeQb([])
const repoQb = makeQb([])
vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        createQueryBuilder: () => repoQb,
        countBy: (filter: unknown) => {
            countBySpy(filter); return Promise.resolve(0) 
        },
        manager: { createQueryBuilder: () => managerQb },
    }),
}))

vi.mock('../../../../src/app/helper/system/system', () => ({
    system: { get: (k: string) => systemGet(k), getEdition: () => edition() },
}))
const systemGet = vi.fn()
const edition = vi.fn()

const { browserAgentActivity } = await import('../../../../src/app/browser-agent/runtime/browser-agent-activity.service')
const { assertOperator } = await import('../../../../src/app/browser-agent/runtime/browser-agent-activity-admin.module')

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

beforeEach(() => {
    ownerFilterSpy.mockReset()
    platformFilterSpy.mockReset()
    countBySpy.mockClear()
    whereParams.length = 0
    systemGet.mockReset()
    edition.mockReset()
})

describe('Tier 1 — user runs are OWNER-scoped', () => {
    it('reads through agentScope.ownerFilter with the acting user + platform (never cross-user)', async () => {
        await browserAgentActivity(log).listUserRuns({ platformId: 'plat_1', userId: 'user_1' }, {})
        expect(ownerFilterSpy).toHaveBeenCalledWith({ platformId: 'plat_1', userId: 'user_1' })
        // The count is owner-filtered too — a user's total must not include anyone else's runs.
        expect(countBySpy).toHaveBeenCalledWith({ platformId: 'plat_1', userId: 'user_1' })
        // It NEVER touches platformFilter (that would widen to the whole tenant).
        expect(platformFilterSpy).not.toHaveBeenCalled()
    })
})

describe('Tier 2 — tenant oversight is bounded to the CALLER\'s platform', () => {
    it('aggregates via agentScope.platformFilter with exactly the passed platformId', async () => {
        await browserAgentActivity(log).platformOverview({ platformId: 'plat_1' }, 30)
        expect(platformFilterSpy).toHaveBeenCalledWith({ platformId: 'plat_1' })
        // Every run-scan carried the platform id as a bound parameter — no unscoped scan.
        expect(whereParams.some((p) => p.pid === 'plat_1')).toBe(true)
        // It NEVER falls back to owner scope (that would hide most of the tenant's activity).
        expect(ownerFilterSpy).not.toHaveBeenCalled()
    })

    it('a different tenant produces a different bound platformId (no cross-tenant bleed)', async () => {
        await browserAgentActivity(log).platformOverview({ platformId: 'plat_2' }, 30)
        expect(platformFilterSpy).toHaveBeenCalledWith({ platformId: 'plat_2' })
        expect(whereParams.every((p) => p.pid !== 'plat_1')).toBe(true)
    })
})

describe('Tier 3 — operator gate (the only cross-tenant read) denies everything but a cloud operator key', () => {
    const OK = 'operator-secret'
    function req(headers: Record<string, unknown>) {
        const send = vi.fn()
        const reply = { status: vi.fn().mockReturnValue({ send }) } as never
        return { request: { headers } as never, reply, status: reply.status }
    }

    it('ALLOWS the exact operator key on CLOUD', async () => {
        edition.mockReturnValue(IbEdition.CLOUD); systemGet.mockReturnValue(OK)
        const { request, reply, status } = req({ 'api-key': OK })
        await expect(assertOperator(request, reply)).resolves.toBeUndefined()
        expect(status).not.toHaveBeenCalled()
    })

    it('DENIES a wrong key, a missing key, and an unset server key (deny-by-default)', async () => {
        edition.mockReturnValue(IbEdition.CLOUD)
        for (const [server, sent] of [[OK, 'wrong'], [OK, undefined], [undefined, 'anything'], [undefined, undefined]] as const) {
            systemGet.mockReturnValue(server)
            const { request, reply, status } = req(sent === undefined ? {} : { 'api-key': sent })
            await expect(assertOperator(request, reply)).rejects.toThrow('Forbidden')
            expect(status).toHaveBeenCalledWith(403)
        }
    })

    it('DENIES the correct key on a NON-cloud edition (cross-tenant never on self-hosted)', async () => {
        systemGet.mockReturnValue(OK)
        for (const ed of [IbEdition.COMMUNITY, IbEdition.ENTERPRISE]) {
            edition.mockReturnValue(ed)
            const { request, reply, status } = req({ 'api-key': OK })
            await expect(assertOperator(request, reply)).rejects.toThrow('Forbidden')
            expect(status).toHaveBeenCalledWith(403)
        }
    })
})
