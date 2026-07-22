import { AiSpendQuery, IbEdition } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The operator gate is the ENTIRE security boundary for the cross-tenant AI-spend surface
 * (`/v1/admin/ai-gateway/spend`), which returns every tenant's costs. A hole here is a customer-data
 * leak, so every deny path is pinned here explicitly.
 *
 * The gate is a HEADER SECRET, not a JWT / id / URL — so there is deliberately nothing a tenant can
 * tamper with (path, query, platform id) to pass it. These tests prove that only the two required
 * conditions (CLOUD edition AND the exact operator key) open it, and that everything else is denied.
 */

const getEdition = vi.fn()
const getSystemProp = vi.fn()

vi.mock('../../../../src/app/helper/system/system', () => ({
    system: {
        getEdition: () => getEdition(),
        get: (k: string) => getSystemProp(k),
        // Present so the module's transitive import graph (redis/db layer reads props at load) does not
        // TypeError before our tests run. Not exercised by the gate itself.
        getOrThrow: () => 'test',
        getNumber: () => undefined,
        getNumberOrThrow: () => 0,
        getBoolean: () => false,
    },
}))

// The gate test does not touch the DB; stub the service so importing the module can't pull in the
// real connection stack.
vi.mock('../../../../src/app/ai-gateway/ai-spend.service', () => ({
    aiSpendService: () => ({
        summaryForPlatform: vi.fn(),
        summaryAcrossPlatforms: vi.fn(),
    }),
}))

const { assertOperator } = await import('../../../../src/app/ai-gateway/ai-gateway-admin.module')

const OPERATOR_KEY = 'super-secret-operator-key'

function makeReqReply(headers: Record<string, unknown>) {
    const send = vi.fn()
    const status = vi.fn().mockReturnValue({ send })
    const reply = { status } as never
    const request = { headers } as never
    return { request, reply, status, send }
}

/** The gate throws on deny; assert BOTH the throw and the 403 reply. */
async function expectDenied(headers: Record<string, unknown>): Promise<void> {
    const { request, reply, status } = makeReqReply(headers)
    await expect(assertOperator(request, reply)).rejects.toThrow('Forbidden')
    expect(status).toHaveBeenCalledWith(403)
}

async function expectAllowed(headers: Record<string, unknown>): Promise<void> {
    const { request, reply, status } = makeReqReply(headers)
    await expect(assertOperator(request, reply)).resolves.toBeUndefined()
    // A pass must NEVER touch the reply — it lets the handler run.
    expect(status).not.toHaveBeenCalled()
}

beforeEach(() => {
    getEdition.mockReset()
    getSystemProp.mockReset()
    // Default happy environment: cloud + a configured key. Individual tests break one condition.
    getEdition.mockReturnValue(IbEdition.CLOUD)
    getSystemProp.mockImplementation((k: string) => (k === 'API_KEY' ? OPERATOR_KEY : undefined))
})

describe('operator gate — the only way in', () => {
    it('ALLOWS the exact operator key on CLOUD', async () => {
        await expectAllowed({ 'api-key': OPERATOR_KEY })
    })
})

describe('operator gate — key tampering is denied', () => {
    it('denies a WRONG key', async () => {
        await expectDenied({ 'api-key': 'not-the-key' })
    })

    it('denies a MISSING key header', async () => {
        await expectDenied({})
    })

    it('denies an empty-string key', async () => {
        await expectDenied({ 'api-key': '' })
    })

    it('denies a near-miss (case / whitespace) — exact match only', async () => {
        await expectDenied({ 'api-key': OPERATOR_KEY.toUpperCase() })
        await expectDenied({ 'api-key': ` ${OPERATOR_KEY} ` })
    })

    it('denies when the header arrives as an array (duplicated header) rather than the exact string', async () => {
        // A duplicated `api-key: x` header parses to an array; it must not coincidentally match.
        await expectDenied({ 'api-key': [OPERATOR_KEY] as unknown })
    })
})

describe('operator gate — deny-by-default when no key is configured', () => {
    it('denies EVEN a request that presents no key when the server has no key set (never open)', async () => {
        getSystemProp.mockReturnValue(undefined)
        await expectDenied({})
    })

    it('denies even if a caller sends some key while the server has none configured', async () => {
        getSystemProp.mockReturnValue(undefined)
        // An attacker cannot "match" an unset secret by sending undefined/empty — unset is CLOSED.
        await expectDenied({ 'api-key': 'anything' })
        await expectDenied({ 'api-key': '' })
    })
})

describe('tenant /spend — no id to tamper with (URL/query tampering is structurally impossible)', () => {
    // The tenant route derives platformId ONLY from the authenticated principal and accepts ONLY
    // `days` in its query. Zod strips unknown keys, so appending ?platformId=<victim> to the URL is
    // silently dropped and can never reach the handler — there is no id input to tamper with at all.
    it('parses `days` and STRIPS a tampered platformId (and any other injected key)', () => {
        const parsed = AiSpendQuery.parse({ days: 7, platformId: 'victim-platform', projectId: 'x' } as never)
        expect(parsed).toEqual({ days: 7 })
        expect('platformId' in parsed).toBe(false)
    })

    it('accepts an empty query (defaults applied server-side) and still carries no id', () => {
        const parsed = AiSpendQuery.parse({})
        expect('platformId' in parsed).toBe(false)
    })

    it('rejects a non-numeric / out-of-range days rather than coercing to something dangerous', () => {
        expect(AiSpendQuery.safeParse({ days: -1 }).success).toBe(false)
        expect(AiSpendQuery.safeParse({ days: 10_000 }).success).toBe(false)
    })
})

describe('operator gate — edition defense-in-depth', () => {
    it('denies the correct key on a NON-cloud edition (self-hosted must never expose cross-tenant reads)', async () => {
        for (const ed of [IbEdition.COMMUNITY, IbEdition.ENTERPRISE]) {
            getEdition.mockReturnValue(ed)
            await expectDenied({ 'api-key': OPERATOR_KEY })
        }
    })

    it('requires BOTH conditions — cloud alone (wrong key) is denied, right key on non-cloud is denied', async () => {
        getEdition.mockReturnValue(IbEdition.CLOUD)
        await expectDenied({ 'api-key': 'wrong' })

        getEdition.mockReturnValue(IbEdition.ENTERPRISE)
        await expectDenied({ 'api-key': OPERATOR_KEY })
    })
})
