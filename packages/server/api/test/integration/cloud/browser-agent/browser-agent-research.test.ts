import { PrincipalType } from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { vi } from 'vitest'
import { generateMockToken } from '../../../helpers/auth'
import { mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

// Script the model to keep calling fetchUrl (one per turn) so we drive the source budget to its cap,
// then compileReport once. A distinct call id per turn keeps tool_use/tool_result pairing valid.
let turnIdx = 0
vi.mock('../../../../src/app/browser-agent/model-provider/model-provider.service', () => ({
    browserAgentModelProvider: () => ({
        callWithTools: async () => {
            turnIdx++
            // 7 fetchUrl turns: 6 gather, the 7th trips the cap → pause. After the user's decision the
            // model calls compileReport (turn 8), then finishes (turn 9). This models an agent that
            // stops fetching and compiles once told the budget is reached (or once expansion is granted).
            if (turnIdx <= 7) {
                return {
                    text: '', toolCalls: [{ id: `c${turnIdx}`, name: 'fetchUrl', args: { url: `https://example.com/${turnIdx}` } }], isFinal: false,
                    usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6, cachedInputTokens: 0, billedTokens: 6 },
                    provider: 'a', model: 'm', state: { __messages: [`t${turnIdx}`] },
                }
            }
            if (turnIdx === 8) {
                return {
                    text: '', toolCalls: [{ id: 'compile', name: 'compileReport', args: { question: 'q' } }], isFinal: false,
                    usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6, cachedInputTokens: 0, billedTokens: 6 },
                    provider: 'a', model: 'm', state: { __messages: ['t8'] },
                }
            }
            return { text: 'Here is the cited report.', toolCalls: [], isFinal: true, usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8, cachedInputTokens: 0, billedTokens: 8 }, provider: 'a', model: 'm', state: { __messages: ['final'] } }
        },
    }),
}))

// Make fetchUrl return a source without any real network call.
vi.mock('../../../../src/app/browser-agent/research/web-fetch.service', () => ({
    browserAgentWebFetch: () => ({
        fetchAndDistill: async (url: string) => ({ url, finalUrl: url, title: `Title ${url}`, extract: `extract ${url}`, truncated: false }),
    }),
}))

let app: FastifyInstance | null = null
beforeAll(async () => { app = await setupTestEnvironment() })
afterAll(async () => { await teardownTestEnvironment() })
beforeEach(() => { turnIdx = 0 })

function parseSse(body: string): Array<Record<string, unknown>> {
    return body.split('\n\n').map((f) => f.trim()).filter((f) => f.startsWith('data:')).map((f) => JSON.parse(f.slice('data:'.length).trim()))
}
async function setupUser() {
    const { mockOwner, mockPlatform, mockProject } = await mockAndSaveBasicSetup()
    const token = await generateMockToken({ type: PrincipalType.USER, id: mockOwner.id, platform: { id: mockPlatform.id }, projectId: mockProject.id })
    return { token, projectId: mockProject.id }
}
async function post(path: string, token: string, body: Record<string, unknown>) {
    return app!.inject({ method: 'POST', url: `/api/v1${path}`, headers: { authorization: `Bearer ${token}` }, body })
}

describe('Browser Agent research — source budget + expansion', () => {
    it('pauses with awaiting_expansion at the source cap; decline compiles from gathered sources', async () => {
        const { token, projectId } = await setupUser()
        const res1 = await post('/browser-agent/chat', token, { projectId, message: 'research X' })
        const e1 = parseSse(res1.body)
        const meta = e1.find((e) => e.type === 'meta') as { runId: string }
        const expansion = e1.find((e) => e.type === 'awaiting_expansion') as { gathered: number, sourceCap: number, canExpand: boolean }
        // gathered 6 sources (research_source events), then paused at the 7th.
        expect(e1.filter((e) => e.type === 'research_source').length).toBe(6)
        expect(expansion).toMatchObject({ gathered: 6, sourceCap: 6, canExpand: true })
        expect(e1.some((e) => e.type === 'done')).toBe(false) // paused

        // Decline → compile now → the run reaches done using the 6 gathered sources.
        const res2 = await post(`/browser-agent/runs/${meta.runId}/decline-expand`, token, { projectId })
        const e2 = parseSse(res2.body)
        expect(e2.some((e) => e.type === 'citations')).toBe(true)
        expect(e2.at(-1)).toMatchObject({ type: 'done' })
    })

    it('expand raises the cap so the paused source fetch resumes and the run completes', async () => {
        const { token, projectId } = await setupUser()
        const res1 = await post('/browser-agent/chat', token, { projectId, message: 'research Y' })
        const e1 = parseSse(res1.body)
        const meta = e1.find((e) => e.type === 'meta') as { runId: string }
        // chat paused at the cap (6 gathered).
        expect(e1.filter((e) => e.type === 'research_source').length).toBe(6)
        expect(e1.some((e) => e.type === 'awaiting_expansion')).toBe(true)

        const res2 = await post(`/browser-agent/runs/${meta.runId}/expand`, token, { projectId })
        const e2 = parseSse(res2.body)
        // After +4 cap, the previously-blocked fetch runs (>=1 more source) and the run reaches a
        // terminal state (done) rather than pausing again.
        expect(e2.filter((e) => e.type === 'research_source').length).toBeGreaterThanOrEqual(1)
        const terminal = e2.filter((e) => e.type === 'done' || e.type === 'awaiting_expansion' || e.type === 'error')
        expect(terminal.at(-1)).toMatchObject({ type: 'done' })
    })
})
