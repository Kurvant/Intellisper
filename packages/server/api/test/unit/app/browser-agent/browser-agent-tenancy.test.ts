import { AGENT_FREE_PLAN, COMPLETE_FREE_PLAN, ErrorCode, IntellisperError, ProductScope, STUDIO_FREE_PLAN } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// IntellisperError.message is the error CODE (+ optional 2nd ctor arg); the human text lives in
// error.params.message. Await the promise ONCE (mocks may be single-use), then assert code + text.
async function expectRejectsWith(promise: Promise<unknown>, code: ErrorCode, messageRe: RegExp): Promise<void> {
    const err = await promise.then(() => null, (e) => e)
    expect(err, 'expected the call to reject').not.toBeNull()
    expect(err).toBeInstanceOf(IntellisperError)
    expect((err as IntellisperError).error.code).toBe(code)
    expect((err as IntellisperError).error.params?.message).toMatch(messageRe)
}

// Mock the DB layer: the tenancy service is pure SQL orchestration, so we assert the queries it
// issues and its branching, without a database. Each test programs the query responses it needs.
const queryMock = vi.fn()
const transactionMock = vi.fn(async (fn: (em: unknown) => Promise<unknown>) => fn({ query: queryMock }))

vi.mock('../../../../src/app/database/database-connection', () => ({
    databaseConnection: () => ({ query: queryMock, transaction: transactionMock }),
}))

// `applyProductScope` first ensures a plan row exists, which goes through the TypeORM repo factory —
// a path this suite deliberately does not model (it asserts the seeding SQL, not persistence). The
// stub keeps that prerequisite out of the way; without it the real repo factory calls
// `getRepository` on the DB double above, which only exposes `query`/`transaction`.
vi.mock('../../../../src/app/enterprise/platform/platform-plan/platform-plan.service', () => ({
    platformPlanService: () => ({
        getOrCreateForPlatform: async () => ({ platformId: 'p1' }),
    }),
}))

import { browserAgentTenancyService } from '../../../../src/app/browser-agent/tenancy/browser-agent-tenancy.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const svc = () => browserAgentTenancyService(log)

beforeEach(() => {
    queryMock.mockReset()
    transactionMock.mockClear()
})

describe('one-platform-per-email guard', () => {
    it('is a NO-OP for a non-browser-agent scope (blockunits behavior preserved)', async () => {
        await svc().assertCanCreateBrowserAgentPlatform({ identityId: 'id1', productScope: ProductScope.BLOCKUNITS })
        await svc().assertCanCreateBrowserAgentPlatform({ identityId: 'id1', productScope: undefined })
        expect(queryMock).not.toHaveBeenCalled()
    })

    it('allows the FIRST browser-agent platform for an identity', async () => {
        queryMock.mockResolvedValueOnce([{ count: '0' }]) // countBrowserAgentPlatformsForIdentity
        await expect(
            svc().assertCanCreateBrowserAgentPlatform({ identityId: 'id1', productScope: ProductScope.BROWSER }),
        ).resolves.toBeUndefined()
    })

    it('REFUSES a second browser-agent platform (BROWSER and FULL both gated)', async () => {
        queryMock.mockResolvedValue([{ count: '1' }])
        await expectRejectsWith(
            svc().assertCanCreateBrowserAgentPlatform({ identityId: 'id1', productScope: ProductScope.BROWSER }),
            ErrorCode.AUTHORIZATION,
            /already has an Intellisper browser-agent workspace/i,
        )
        await expectRejectsWith(
            svc().assertCanCreateBrowserAgentPlatform({ identityId: 'id1', productScope: ProductScope.FULL }),
            ErrorCode.AUTHORIZATION,
            /already has/i,
        )
    })
})

/**
 * The product-scope door now SEEDS THE FREE TIER for the product the customer signed up for
 * (SUBSCRIPTION_PLANS_PROPOSAL §7.7) — it no longer just flips a boolean. The whole entitlement set
 * is written in one statement so a platform can never end up half-seeded (agent open but capless).
 */
describe('product scope application', () => {
    /** The params the seeding UPDATE was called with. */
    function seededWith() {
        expect(queryMock).toHaveBeenCalledTimes(1)
        const [sql, params] = queryMock.mock.calls[0]
        return { sql: sql as string, params: params as unknown[] }
    }

    it('BROWSER seeds Agent Free: opens the agent door with its free caps', async () => {
        queryMock.mockResolvedValue([])
        await svc().applyProductScope({ platformId: 'p1', productScope: ProductScope.BROWSER })

        const { sql, params } = seededWith()
        expect(sql).toMatch(/UPDATE "platform_plan"/)
        expect(params[0]).toBe('p1')
        expect(params[1]).toBe(AGENT_FREE_PLAN.plan)
        expect(params[2]).toBe(true) // browserAgentEnabled
        expect(JSON.parse(params[3] as string)).toEqual(AGENT_FREE_PLAN.agentCaps)
    })

    it('BLOCKUNITS seeds Studio Free: the agent door stays CLOSED', async () => {
        queryMock.mockResolvedValue([])
        await svc().applyProductScope({ platformId: 'p1', productScope: ProductScope.BLOCKUNITS })

        const { params } = seededWith()
        expect(params[1]).toBe(STUDIO_FREE_PLAN.plan)
        expect(params[2]).toBe(false) // agent NOT opened — it is not that product
        expect(params[5]).toBe(STUDIO_FREE_PLAN.activeFlowsLimit) // Studio gets its flows
    })

    it('FULL seeds Complete Free: BOTH doors open', async () => {
        queryMock.mockResolvedValue([])
        await svc().applyProductScope({ platformId: 'p1', productScope: ProductScope.FULL })

        const { params } = seededWith()
        expect(params[1]).toBe(COMPLETE_FREE_PLAN.plan)
        expect(params[2]).toBe(true)
        expect(JSON.parse(params[3] as string)).toEqual(COMPLETE_FREE_PLAN.agentCaps)
        expect(params[5]).toBe(COMPLETE_FREE_PLAN.activeFlowsLimit)
    })

    it('is a NO-OP with no scope (a stock platform keeps its edition default)', async () => {
        await svc().applyProductScope({ platformId: 'p1', productScope: undefined })
        await svc().applyProductScope({ platformId: 'p1', productScope: null })
        expect(queryMock).not.toHaveBeenCalled()
    })

    it('NEVER clobbers a paid plan — seeding only applies to a default/free platform', async () => {
        queryMock.mockResolvedValue([])
        await svc().applyProductScope({ platformId: 'p1', productScope: ProductScope.BROWSER })

        const { sql } = seededWith()
        // The guard is what stops a re-run of signup-time scoping from wiping a subscription.
        expect(sql).toMatch(/WHERE .*"platformId" = \$1/s)
        expect(sql).toMatch(/AND \(COALESCE\("plan", ''\) = '' OR "plan" IN \(/s)
        expect(sql).toMatch(/'standard'/)
    })
})

describe('invite-collision resolution', () => {
    it('decline is a no-op that touches nothing', async () => {
        const res = await svc().resolvePersonalPlatformCollision({ identityId: 'id1', action: 'decline' })
        expect(res).toEqual({ moved: 0, action: 'decline' })
        expect(queryMock).not.toHaveBeenCalled()
        expect(transactionMock).not.toHaveBeenCalled()
    })

    it('no-op when the identity owns no browser-agent platform', async () => {
        queryMock.mockResolvedValueOnce([]) // findBrowserAgentPlatformForIdentity → none
        const res = await svc().resolvePersonalPlatformCollision({ identityId: 'id1', action: 'abandon' })
        expect(res).toEqual({ moved: 0, action: 'abandon' })
        expect(transactionMock).not.toHaveBeenCalled()
    })

    it('abandon deletes owner-scoped rows across all agent tables + disables the personal flag', async () => {
        queryMock.mockResolvedValueOnce([{ platformId: 'p_personal', userId: 'u_personal' }]) // find
        // every DELETE returns [rows, affected]; final UPDATE returns []
        queryMock.mockResolvedValue([[], 2])
        const res = await svc().resolvePersonalPlatformCollision({ identityId: 'id1', action: 'abandon' })
        expect(transactionMock).toHaveBeenCalledTimes(1)
        const deletes = queryMock.mock.calls.filter((c) => /DELETE FROM/.test(c[0]))
        // 11 owner-scoped tables deleted, each scoped by owner + platform
        expect(deletes.length).toBe(11)
        for (const [, params] of deletes) {
            expect(params).toEqual(['u_personal', 'p_personal'])
        }
        // personal platform browser-agent flag disabled
        expect(queryMock.mock.calls.some((c) => /SET "browserAgentEnabled" = false/.test(c[0]))).toBe(true)
        expect(res.action).toBe('abandon')
    })

    it('transfer requires a targetPlatformId', async () => {
        queryMock.mockResolvedValueOnce([{ platformId: 'p_personal', userId: 'u_personal' }])
        await expectRejectsWith(
            svc().resolvePersonalPlatformCollision({ identityId: 'id1', action: 'transfer' }),
            ErrorCode.VALIDATION,
            /target platform is required/i,
        )
    })

    it('transfer rejects when target === personal platform', async () => {
        queryMock.mockResolvedValue([{ platformId: 'p_personal', userId: 'u_personal' }])
        await expectRejectsWith(
            svc().resolvePersonalPlatformCollision({ identityId: 'id1', action: 'transfer', targetPlatformId: 'p_personal' }),
            ErrorCode.VALIDATION,
            /same as your personal/i,
        )
    })

    it('transfer requires the user to have joined the target platform first', async () => {
        queryMock.mockResolvedValueOnce([{ platformId: 'p_personal', userId: 'u_personal' }]) // find
        queryMock.mockResolvedValueOnce([]) // target user row lookup → not a member
        await expectRejectsWith(
            svc().resolvePersonalPlatformCollision({ identityId: 'id1', action: 'transfer', targetPlatformId: 'p_team' }),
            ErrorCode.AUTHORIZATION,
            /join the target workspace/i,
        )
    })

    it('transfer re-homes rows to the target user+platform, scoped by old owner+platform', async () => {
        queryMock.mockResolvedValueOnce([{ platformId: 'p_personal', userId: 'u_personal' }]) // find
        queryMock.mockResolvedValueOnce([{ id: 'u_target' }]) // target user row
        queryMock.mockResolvedValue([[], 3]) // each UPDATE
        const res = await svc().resolvePersonalPlatformCollision({
            identityId: 'id1', action: 'transfer', targetPlatformId: 'p_team',
        })
        const updates = queryMock.mock.calls.filter((c) => /UPDATE "browser_agent_/.test(c[0]) && /SET "userId"/.test(c[0]))
        expect(updates.length).toBe(11)
        for (const [, params] of updates) {
            // new owner + new platform, scoped by old owner + old platform
            expect(params).toEqual(['u_target', 'p_team', 'u_personal', 'p_personal'])
        }
        expect(res.action).toBe('transfer')
    })
})
