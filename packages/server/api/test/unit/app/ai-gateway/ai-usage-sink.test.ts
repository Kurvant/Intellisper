import { AiFeature, AiKeyMode, AiModality, type ReportAiUsageRequest } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('../../../../src/app/database/database-connection', () => ({
    databaseConnection: () => ({ query: queryMock }),
}))

const { aiUsageSink } = await import('../../../../src/app/ai-gateway/ai-usage-sink')

const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never
const sink = () => aiUsageSink(log)

function call(overrides: Partial<ReportAiUsageRequest> = {}): ReportAiUsageRequest {
    return {
        idempotencyKey: 'run1:turn1',
        platformId: 'plat1',
        projectId: 'proj1',
        userId: 'user1',
        feature: AiFeature.BROWSER_AGENT,
        featureRef: 'run1',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        modality: AiModality.TEXT,
        keyMode: AiKeyMode.MANAGED,
        tokens: { inputTokens: 200, outputTokens: 300, cacheReadTokens: 1000, cacheWriteTokens: 50, reasoningTokens: 0 },
        providerCostUsd: null,
        requestId: 'req_1',
        occurredAt: Date.UTC(2026, 6, 14, 12, 0, 0),
        ...overrides,
    }
}

beforeEach(() => {
    queryMock.mockReset()
    queryMock.mockResolvedValue([])
    sink()._reset()
})

describe('aiUsageSink — the request path is sacred', () => {
    it('record() is synchronous and does NO I/O (the user never waits on the ledger)', () => {
        sink().record(call())
        // Nothing has hit the database yet — the row is buffered, and the caller has already moved on.
        expect(queryMock).not.toHaveBeenCalled()
        expect(sink().stats().buffered).toBe(1)
    })

    it('NEVER throws into the caller, even if pricing/serialisation blows up', () => {
        // A malformed call must not propagate: an AI request must never fail because metering did.
        expect(() => sink().record({ ...call(), tokens: null as never })).not.toThrow()
        expect(log.warn).toHaveBeenCalled()
    })

    it('a DB failure on flush does not surface to anyone — rows are requeued, not lost', async () => {
        queryMock.mockRejectedValueOnce(new Error('db down'))
        sink().record(call())
        await expect(sink().flushNow()).resolves.toBeUndefined()
        // Kept for the next attempt rather than dropped on the floor.
        expect(sink().stats().buffered).toBe(1)
        expect(log.warn).toHaveBeenCalled()
    })
})

describe('aiUsageSink — the write', () => {
    it('writes ONE batched INSERT with ON CONFLICT DO NOTHING (the anti-double-count guarantee)', async () => {
        sink().record(call({ idempotencyKey: 'k1' }))
        sink().record(call({ idempotencyKey: 'k2' }))
        await sink().flushNow()

        expect(queryMock).toHaveBeenCalledTimes(1) // batched, not one statement per call
        const [sql, params] = queryMock.mock.calls[0]
        expect(sql).toContain('INSERT INTO "ai_usage_ledger"')
        expect(sql).toContain('ON CONFLICT ("idempotencyKey") DO NOTHING')
        expect(sql).toContain('"idempotencyKey"') // the key is actually IN the column list
        expect(params).toContain('k1')
        expect(params).toContain('k2')
    })

    it('binds exactly one placeholder per value — columns and params cannot drift', async () => {
        sink().record(call({ idempotencyKey: 'k1' }))
        sink().record(call({ idempotencyKey: 'k2' }))
        await sink().flushNow()

        const [sql, params] = queryMock.mock.calls[0]
        const columnCount = (sql as string).slice((sql as string).indexOf('(') + 1, (sql as string).indexOf(')')).split(',').length
        const placeholders = (sql as string).match(/\$\d+/g) ?? []
        // Every bound value has a placeholder, and every row supplies every column. A mismatch here
        // would silently shift values into the wrong columns — a corrupt ledger, worse than no ledger.
        expect(placeholders.length).toBe((params as unknown[]).length)
        expect((params as unknown[]).length).toBe(columnCount * 2)
        // Placeholders are contiguous and 1-based across the whole statement.
        expect(placeholders[0]).toBe('$1')
        expect(placeholders[placeholders.length - 1]).toBe(`$${(params as unknown[]).length}`)
    })

    it('prices the call AT RECORD TIME and stores cost + source + credits', async () => {
        sink().record(call()) // Haiku: 200 fresh + 1000 read + 50 write + 300 out = $0.0018625
        await sink().flushNow()

        const params = queryMock.mock.calls[0][1] as unknown[]
        expect(params).toContain('computed')            // costSource: no provider cost was supplied
        const cost = params.find((p) => typeof p === 'number' && p > 0 && p < 0.01)
        expect(cost).toBeCloseTo(0.0018625, 10)
        expect(params).toContain(2)                     // billedCredits = ceil(0.0018625 * 1000)
    })

    it('an UNPRICED call is recorded with its tokens but charges the customer NOTHING', async () => {
        sink().record(call({ model: 'some-model-we-do-not-price' }))
        await sink().flushNow()

        const params = queryMock.mock.calls[0][1] as unknown[]
        expect(params).toContain('unpriced')
        // Tokens survive (so the volume is visible), but we never invoice a number we could not compute.
        expect(params).toContain(200)   // inputTokens
        expect(params).toContain(1000)  // cacheReadTokens
        expect(params).toContain(0)     // billedCredits
    })

    it('takes the PROVIDER cost verbatim when it is supplied', async () => {
        sink().record(call({ provider: 'openrouter', model: 'anthropic/claude-haiku-4-5', providerCostUsd: 0.00427 }))
        await sink().flushNow()

        const params = queryMock.mock.calls[0][1] as unknown[]
        expect(params).toContain('provider')
        expect(params).toContain(0.00427)
        expect(params).toContain(5) // billedCredits = ceil(0.00427 * 1000)
    })
})

describe('aiUsageSink — bounded, never OOMs the API', () => {
    it('drops rows (loudly) rather than growing without bound when the DB is wedged', async () => {
        // Simulate the genuinely dangerous case: the DB accepts the connection but NEVER answers, so
        // in-flight flushes hang and cannot drain the buffer while traffic keeps arriving. This is the
        // scenario that would otherwise grow the buffer until the API dies.
        queryMock.mockImplementation(() => new Promise(() => { /* never settles */ }))

        for (let i = 0; i < 20_500; i++) {
            sink().record(call({ idempotencyKey: `k${i}` }))
        }

        const { buffered, dropped } = sink().stats()
        // Hard ceiling honoured...
        expect(buffered).toBeLessThanOrEqual(20_000)
        // ...and the overflow is DROPPED and COUNTED, not silently swallowed and not retained.
        expect(dropped).toBeGreaterThan(0)
        expect(buffered + dropped).toBe(20_500 - 200) // 200 rows are in the hung in-flight batch
        // Loudly: under-reporting AI spend is a business problem, so it must not be a silent one.
        expect(log.error).toHaveBeenCalled()
        // The point: a metrics buffer must never be able to exhaust the heap of the API serving
        // customer traffic. Losing a metrics row is survivable; an OOM is not.
    })

    it('auto-flushes once the batch threshold is reached', async () => {
        for (let i = 0; i < 200; i++) {
            sink().record(call({ idempotencyKey: `k${i}` }))
        }
        await vi.waitFor(() => expect(queryMock).toHaveBeenCalled())
        expect(sink().stats().buffered).toBe(0)
    })

    it('close() drains — a normal deploy loses nothing', async () => {
        sink().record(call())
        await sink().close()
        expect(queryMock).toHaveBeenCalledTimes(1)
        expect(sink().stats().buffered).toBe(0)
    })
})
