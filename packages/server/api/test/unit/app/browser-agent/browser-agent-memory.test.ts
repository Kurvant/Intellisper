import { MemoryFactKind, MemoryFactSource } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('../../../../src/app/database/database-connection', () => ({
    databaseConnection: () => ({ query: queryMock }),
}))

const embedMock = vi.fn()
vi.mock('../../../../src/app/browser-agent/model-provider/model-provider.service', () => ({
    browserAgentModelProvider: () => ({ embed: embedMock }),
}))

import { browserAgentMemory } from '../../../../src/app/browser-agent/memory/browser-agent-memory.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const svc = () => browserAgentMemory(log)
const scope = { userId: 'u1', platformId: 'p1' }
const vec1536 = () => Array.from({ length: 1536 }, () => 0.01)

function vectorAvailable(available: boolean) {
    queryMock.mockResolvedValueOnce([{ installed: available }]) // isVectorAvailable probe
}

beforeEach(() => {
    queryMock.mockReset()
    embedMock.mockReset()
    embedMock.mockResolvedValue(vec1536())
    svc()._resetVectorProbe()
})

describe('remember — secret guard', () => {
    it('refuses credential-like content WITHOUT embedding or touching the DB', async () => {
        const res = await svc().remember(scope, 'my password is hunter2', MemoryFactKind.NOTE, MemoryFactSource.EXPLICIT)
        expect(res).toEqual({ saved: false, refused: true })
        expect(embedMock).not.toHaveBeenCalled()
        expect(queryMock).not.toHaveBeenCalled()
    })

    it('refuses a long digit run (card/account number)', async () => {
        const res = await svc().remember(scope, 'the number is 4111 1111 1111 1111', MemoryFactKind.NOTE, MemoryFactSource.EXPLICIT)
        expect(res.refused).toBe(true)
    })

    it('refuses api keys / tokens / ssn', async () => {
        for (const bad of ['my api_key is abc', 'bearer token xyz', 'ssn 123-45-6789']) {
            svc()._resetVectorProbe()
            expect((await svc().remember(scope, bad, MemoryFactKind.NOTE, MemoryFactSource.EXPLICIT)).refused).toBe(true)
        }
    })
})

describe('remember — dedupe branch', () => {
    it('INSERTs when no near-duplicate exists', async () => {
        vectorAvailable(true)
        queryMock.mockResolvedValueOnce([]) // nearest → none
        queryMock.mockResolvedValueOnce([]) // INSERT
        const res = await svc().remember(scope, 'I prefer dark mode', MemoryFactKind.PREFERENCE, MemoryFactSource.EXPLICIT)
        expect(res.saved).toBe(true)
        const insert = queryMock.mock.calls.find((c) => /INSERT INTO browser_agent_memory_fact/.test(c[0]))
        expect(insert).toBeTruthy()
        // scoped to platform + user
        expect(insert![1]).toContain('p1')
        expect(insert![1]).toContain('u1')
    })

    it('UPDATEs in place when a near-duplicate is within the dedupe distance', async () => {
        vectorAvailable(true)
        queryMock.mockResolvedValueOnce([{ id: 'existing1', distance: 0.02 }]) // nearest, <= 0.08
        queryMock.mockResolvedValueOnce([]) // UPDATE
        const res = await svc().remember(scope, 'I like dark mode', MemoryFactKind.PREFERENCE, MemoryFactSource.EXPLICIT)
        expect(res).toEqual({ saved: true, id: 'existing1' })
        const update = queryMock.mock.calls.find((c) => /UPDATE browser_agent_memory_fact\s+SET content/.test(c[0]))
        expect(update).toBeTruthy()
        expect(queryMock.mock.calls.some((c) => /INSERT INTO/.test(c[0]))).toBe(false)
    })

    it('INSERTs when the nearest is beyond the dedupe distance', async () => {
        vectorAvailable(true)
        queryMock.mockResolvedValueOnce([{ id: 'far', distance: 0.5 }]) // > 0.08
        queryMock.mockResolvedValueOnce([])
        const res = await svc().remember(scope, 'unrelated fact', MemoryFactKind.NOTE, MemoryFactSource.EXPLICIT)
        expect(res.saved).toBe(true)
        expect(queryMock.mock.calls.some((c) => /INSERT INTO/.test(c[0]))).toBe(true)
    })
})

describe('graceful degradation (no pgvector)', () => {
    it('remember no-ops (saved:false) without embedding', async () => {
        vectorAvailable(false)
        const res = await svc().remember(scope, 'a fact', MemoryFactKind.NOTE, MemoryFactSource.EXPLICIT)
        expect(res).toEqual({ saved: false })
        expect(embedMock).not.toHaveBeenCalled()
    })

    it('recall returns [] without embedding', async () => {
        vectorAvailable(false)
        expect(await svc().recall(scope, 'anything', 5)).toEqual([])
        expect(embedMock).not.toHaveBeenCalled()
    })
})

describe('recall — scoping + relevance', () => {
    it('scopes the query by platform + user and maps distance→relevance', async () => {
        vectorAvailable(true)
        queryMock.mockResolvedValueOnce([{ id: 'f1', content: 'dark mode', kind: 'PREFERENCE', distance: 0.2 }])
        const facts = await svc().recall(scope, 'ui prefs', 5)
        expect(facts).toEqual([{ id: 'f1', content: 'dark mode', kind: 'PREFERENCE', relevance: 0.9 }])
        const recallCall = queryMock.mock.calls.find((c) => /FROM browser_agent_memory_fact/.test(c[0]) && /ORDER BY distance/.test(c[0]))
        expect(recallCall![1]).toContain('p1')
        expect(recallCall![1]).toContain('u1')
    })
})

describe('forget — owner-scoped soft delete', () => {
    it('scopes the delete by platform + user', async () => {
        queryMock.mockResolvedValueOnce([[], 1]) // UPDATE affected 1
        const res = await svc().forget(scope, 'f1')
        expect(res.ok).toBe(true)
        const del = queryMock.mock.calls.find((c) => /SET "deletedAt" = now/.test(c[0]))
        expect(del![1]).toEqual(['f1', 'p1', 'u1'])
    })
    it('reports ok:false when nothing was deleted (not owned)', async () => {
        queryMock.mockResolvedValueOnce([[], 0])
        expect((await svc().forget(scope, 'f1')).ok).toBe(false)
    })
})
