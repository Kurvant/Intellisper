import { PrincipalType } from '@intelblocks/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'
import { generateMockToken } from '../../../helpers/auth'
import { mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

// Mock the model-provider facade so tests script model turns without a real API key. Each entry is
// one turn: text completes; toolCalls dispatch tools; empty stalls (engine escalates).
const scriptedTurns: Array<{ text?: string, toolCalls?: Array<{ id: string, name: string, args?: Record<string, unknown> }> }> = []
let turnIdx = 0

vi.mock('../../../../src/app/browser-agent/model-provider/model-provider.service', () => ({
    browserAgentModelProvider: () => ({
        callWithTools: async () => {
            const t = scriptedTurns[turnIdx++] ?? {}
            const toolCalls = (t.toolCalls ?? []).map((c) => ({ id: c.id, name: c.name, args: c.args ?? {} }))
            const text = t.text ?? ''
            return {
                text,
                toolCalls,
                isFinal: toolCalls.length === 0 && text.trim().length > 0,
                usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, cachedInputTokens: 0, billedTokens: 15 },
                provider: 'anthropic', model: 'test',
                state: { __messages: [`turn${turnIdx}`] },
            }
        },
    }),
}))

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})
afterAll(async () => {
    await teardownTestEnvironment()
})
beforeEach(() => {
    scriptedTurns.length = 0
    turnIdx = 0
})

/** Parse SSE `data: {json}` frames from a hijacked response body. */
function parseSse(body: string): Array<Record<string, unknown>> {
    return body.split('\n\n').map((f) => f.trim()).filter((f) => f.startsWith('data:'))
        .map((f) => JSON.parse(f.slice('data:'.length).trim()))
}

async function setupUser() {
    const { mockOwner, mockPlatform, mockProject } = await mockAndSaveBasicSetup()
    const token = await generateMockToken({ type: PrincipalType.USER, id: mockOwner.id, platform: { id: mockPlatform.id }, projectId: mockProject.id })
    return { token, userId: mockOwner.id, platformId: mockPlatform.id, projectId: mockProject.id }
}

async function post(path: string, token: string, body: Record<string, unknown>) {
    return app!.inject({ method: 'POST', url: `/api/v1${path}`, headers: { authorization: `Bearer ${token}` }, body })
}

describe('Browser Agent chat — SSE round-trip (Phase 4)', () => {
    it('a plain text turn streams meta + text + done', async () => {
        scriptedTurns.push({ text: 'Hello from the agent.' })
        const { token, projectId } = await setupUser()
        const res = await post('/browser-agent/chat', token, { projectId, message: 'hi' })
        expect(res.statusCode).toBe(StatusCodes.OK)
        expect(res.headers['content-type']).toContain('text/event-stream')
        expect(res.headers['x-intellisper-protocol']).toBe('1')
        const events = parseSse(res.body)
        expect(events[0]).toMatchObject({ type: 'meta' })
        expect(events.some((e) => e.type === 'text' && e.text === 'Hello from the agent.')).toBe(true)
        expect(events.at(-1)).toMatchObject({ type: 'done' })
    })

    it('a server page tool runs inline and the run completes', async () => {
        scriptedTurns.push({ toolCalls: [{ id: 'c1', name: 'readPage', args: {} }] })
        scriptedTurns.push({ text: 'The page is about X.' })
        const { token, projectId } = await setupUser()
        const res = await post('/browser-agent/chat', token, {
            projectId, message: 'what is this page?',
            page: { url: 'https://example.com', title: 'Example', text: 'hello world', docType: 'html' },
        })
        const events = parseSse(res.body)
        expect(events.some((e) => e.type === 'tool' && e.tool === 'readPage' && e.status === 'done')).toBe(true)
        expect(events.at(-1)).toMatchObject({ type: 'done' })
    })

    it('an extension action PAUSES the stream (emits action, no done); observation resumes to done', async () => {
        scriptedTurns.push({ toolCalls: [{ id: 'c1', name: 'click', args: { ref: 'el-1' } }] })
        scriptedTurns.push({ text: 'Clicked and finished.' })
        const { token, projectId } = await setupUser()
        const res1 = await post('/browser-agent/chat', token, { projectId, message: 'click it' })
        const events1 = parseSse(res1.body)
        const meta = events1.find((e) => e.type === 'meta') as { runId: string }
        const action = events1.find((e) => e.type === 'action') as { actionId: string, tool: string }
        expect(action).toMatchObject({ tool: 'click' })
        expect(events1.some((e) => e.type === 'done')).toBe(false) // paused

        const res2 = await post(`/browser-agent/runs/${meta.runId}/observation`, token, {
            projectId, actionId: action.actionId, ok: true, observation: { snapshot: { url: 'https://x', title: 'x', text: 'done' } },
        })
        const events2 = parseSse(res2.body)
        expect(events2.at(-1)).toMatchObject({ type: 'done' })
    })

    it('a consequential action awaits confirmation; approve dispatches then observation completes', async () => {
        scriptedTurns.push({ toolCalls: [{ id: 'c1', name: 'submitForm', args: { ref: 'el-1', description: 'send it' } }] })
        scriptedTurns.push({ text: 'Submitted.' })
        const { token, projectId } = await setupUser()
        const res1 = await post('/browser-agent/chat', token, { projectId, message: 'submit the form' })
        const events1 = parseSse(res1.body)
        const meta = events1.find((e) => e.type === 'meta') as { runId: string }
        const confirm = events1.find((e) => e.type === 'awaiting_confirmation') as { actionId: string }
        expect(confirm).toMatchObject({ type: 'awaiting_confirmation', tool: 'submitForm' })

        const resApprove = await post(`/browser-agent/runs/${meta.runId}/approve`, token, { projectId, actionId: confirm.actionId })
        const approveEvents = parseSse(resApprove.body)
        expect(approveEvents.some((e) => e.type === 'action' && e.tool === 'submitForm')).toBe(true)

        const resObs = await post(`/browser-agent/runs/${meta.runId}/observation`, token, {
            projectId, actionId: confirm.actionId, ok: true, observation: { snapshot: { text: 'ok' } },
        })
        expect(parseSse(resObs.body).at(-1)).toMatchObject({ type: 'done' })
    })

    it('reject continues the run without performing the action', async () => {
        scriptedTurns.push({ toolCalls: [{ id: 'c1', name: 'submitForm', args: { ref: 'el-1', description: 'send' } }] })
        scriptedTurns.push({ text: 'Okay, I did not submit it.' })
        const { token, projectId } = await setupUser()
        const res1 = await post('/browser-agent/chat', token, { projectId, message: 'submit' })
        const meta = parseSse(res1.body).find((e) => e.type === 'meta') as { runId: string }
        const confirm = parseSse(res1.body).find((e) => e.type === 'awaiting_confirmation') as { actionId: string }
        const resReject = await post(`/browser-agent/runs/${meta.runId}/reject`, token, { projectId, actionId: confirm.actionId })
        expect(parseSse(resReject.body).at(-1)).toMatchObject({ type: 'done' })
    })
})

describe('Browser Agent chat — isolation (red-team)', () => {
    it('a user CANNOT resume another user\'s run (cross-user observation → error, no leak)', async () => {
        scriptedTurns.push({ toolCalls: [{ id: 'c1', name: 'click', args: { ref: 'el-1' } }] })
        const owner = await setupUser()
        const res1 = await post('/browser-agent/chat', owner.token, { projectId: owner.projectId, message: 'click' })
        const meta = parseSse(res1.body).find((e) => e.type === 'meta') as { runId: string }
        const action = parseSse(res1.body).find((e) => e.type === 'action') as { actionId: string }

        // A different user on a different platform tries to resume the owner's run.
        const attacker = await setupUser()
        const res2 = await post(`/browser-agent/runs/${meta.runId}/observation`, attacker.token, {
            projectId: attacker.projectId, actionId: action.actionId, ok: true, observation: {},
        })
        const events = parseSse(res2.body)
        // The run is not found for the attacker → an error event, never a `done`/data leak.
        expect(events.some((e) => e.type === 'error')).toBe(true)
        expect(events.some((e) => e.type === 'done')).toBe(false)
    })
})
