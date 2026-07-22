import { describe, expect, it, vi } from 'vitest'
import { driveEngine, type EngineDeps, type ServerToolOutcome } from '../../../../src/app/browser-agent/engine/agent-engine'
import type { AgentEvent, RunCheckpoint } from '../../../../src/app/browser-agent/engine/agent-engine.types'
import type { ProviderToolCall } from '../../../../src/app/browser-agent/model-provider/model-provider.types'

// A scripted model: each entry is one turn's response. Tracks the tier it was asked to run on.
type ScriptedTurn = { text?: string, toolCalls?: ProviderToolCall[], billedTokens?: number }

function makeDeps(params: {
    turns: ScriptedTurn[]
    dispatch?: (call: ProviderToolCall) => Promise<ServerToolOutcome>
    reasoningAllowed?: boolean
    maxSteps?: number
    costCeiling?: number
    tiersSeen?: string[]
}): EngineDeps {
    let i = 0
    return {
        runId: 'run1', conversationId: 'conv1', systemPrompt: 'sys', seedMessages: [], toolDefs: [],
        reasoningAllowed: params.reasoningAllowed ?? false,
        maxSteps: params.maxSteps ?? 10,
        costCeiling: params.costCeiling ?? 1_000_000,
        callModel: async ({ tier }) => {
            params.tiersSeen?.push(tier)
            const t = params.turns[i++] ?? {}
            const toolCalls = t.toolCalls ?? []
            const text = t.text ?? ''
            return {
                text,
                toolCalls,
                // Mirror the facade: final iff text AND no tools; an empty turn is a stall, not final.
                isFinal: toolCalls.length === 0 && text.trim().length > 0,
                billedTokens: t.billedTokens ?? 10,
                state: { __messages: [`turn${i}`] },
            }
        },
        dispatchTool: params.dispatch ?? (async () => ({ kind: 'server', ok: true, observation: { ok: true } })),
        persist: vi.fn(async () => {}),
        labelFor: (n) => `do ${n}`,
        summaryFor: (c) => `summary ${c.name}`,
        classOf: () => 'safe',
        finish: vi.fn(async () => {}),
    }
}

function freshCp(): RunCheckpoint {
    return { loopState: null, finalText: '', totalTokens: 0, steps: 0, page: null }
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
    const out: AgentEvent[] = []
    for await (const e of gen) out.push(e)
    return out
}

const call = (id: string, name: string): ProviderToolCall => ({ id, name, args: {} })

describe('driveEngine — happy path', () => {
    it('a plain text turn completes immediately', async () => {
        const cp = freshCp()
        const deps = makeDeps({ turns: [{ text: 'Hello, done.' }] })
        const events = await collect(driveEngine(cp, deps))
        expect(events).toContainEqual({ type: 'text', text: 'Hello, done.' })
        expect(events.at(-1)).toMatchObject({ type: 'done', steps: 1 })
        expect(deps.finish).toHaveBeenCalledWith(expect.anything(), 'completed', null)
        expect(cp.totalTokens).toBe(10)
    })

    it('a server tool call runs inline, feeds the next turn, then completes', async () => {
        const cp = freshCp()
        const dispatch = vi.fn(async () => ({ kind: 'server', ok: true, observation: { data: 42 } }) as ServerToolOutcome)
        const deps = makeDeps({
            turns: [{ toolCalls: [call('c1', 'readPage')] }, { text: 'The answer is 42.' }],
            dispatch,
        })
        const events = await collect(driveEngine(cp, deps))
        expect(dispatch).toHaveBeenCalledTimes(1)
        expect(events).toContainEqual({ type: 'tool', tool: 'readPage', status: 'done', label: 'do readPage' })
        expect(events.at(-1)).toMatchObject({ type: 'done', steps: 2 })
    })
})

describe('driveEngine — extension action pause/resume', () => {
    it('PAUSES on a safe extension action (emits action, stops)', async () => {
        const cp = freshCp()
        const dispatch = vi.fn(async () => ({ kind: 'extension', actionId: 'a1', actionClass: 'safe' }) as ServerToolOutcome)
        const deps = makeDeps({ turns: [{ toolCalls: [call('c1', 'click')] }], dispatch })
        const events = await collect(driveEngine(cp, deps))
        const action = events.find((e) => e.type === 'action')
        expect(action).toMatchObject({ type: 'action', actionId: 'a1', tool: 'click', actionClass: 'safe' })
        // paused: no 'done'
        expect(events.some((e) => e.type === 'done')).toBe(false)
        // checkpoint carries the pairing + emptied pending (this was the last call)
        expect(cp.actionCallIds).toEqual({ a1: 'c1' })
        expect(cp.pendingCalls).toEqual([])
    })

    it('PAUSES with awaiting_confirmation on a consequential extension action', async () => {
        const cp = freshCp()
        const dispatch = vi.fn(async () => ({ kind: 'extension', actionId: 'a2', actionClass: 'consequential' }) as ServerToolOutcome)
        const deps = makeDeps({ turns: [{ toolCalls: [call('c1', 'submitForm')] }], dispatch })
        const events = await collect(driveEngine(cp, deps))
        expect(events.find((e) => e.type === 'awaiting_confirmation')).toMatchObject({
            type: 'awaiting_confirmation', actionId: 'a2', tool: 'submitForm', summary: 'summary submitForm',
        })
    })

    it('resumes from a persisted pending batch and completes', async () => {
        // Simulate a resume: checkpoint already carries a pending call + its gathered result slot.
        const cp: RunCheckpoint = {
            ...freshCp(), loopState: { __messages: ['prior'] }, steps: 1,
            pendingCalls: [call('c2', 'readPage')], gatheredResults: [],
            actionCallIds: {},
        }
        const deps = makeDeps({ turns: [{ text: 'resumed + done' }] })
        const events = await collect(driveEngine(cp, deps))
        expect(events.at(-1)).toMatchObject({ type: 'done' })
        expect(cp.pendingCalls).toBeUndefined()
    })
})

describe('driveEngine — tier escalation (stall-based cost routing)', () => {
    it('escalates default → escalation → reasoning on consecutive stalls (Max/Enterprise)', async () => {
        const cp = freshCp()
        const tiersSeen: string[] = []
        // Two stalls (empty turns), then a final text turn.
        const deps = makeDeps({
            turns: [{}, {}, { text: 'finally' }],
            reasoningAllowed: true,
            tiersSeen,
        })
        await collect(driveEngine(cp, deps))
        expect(tiersSeen).toEqual(['default', 'escalation', 'reasoning'])
    })

    it('never reaches reasoning when not allowed (Midi/Free cap at escalation)', async () => {
        const cp = freshCp()
        const tiersSeen: string[] = []
        const deps = makeDeps({ turns: [{}, {}, { text: 'done' }], reasoningAllowed: false, tiersSeen })
        await collect(driveEngine(cp, deps))
        expect(tiersSeen).toEqual(['default', 'escalation', 'escalation'])
    })
})

describe('driveEngine — guards', () => {
    it('halts on max_steps', async () => {
        const cp = freshCp()
        // Always returns a server tool call → never final → hits maxSteps.
        const deps = makeDeps({
            turns: Array.from({ length: 10 }, () => ({ toolCalls: [call('c', 'readPage')] })),
            maxSteps: 3,
        })
        const events = await collect(driveEngine(cp, deps))
        expect(events.at(-1)).toMatchObject({ type: 'halted', reason: 'max_steps' })
    })

    it('halts on cost ceiling', async () => {
        const cp = freshCp()
        // Turn 1 dispatches a server tool (so the run CONTINUES) and spends 5000 > the 1000 ceiling;
        // the top-of-loop budget check on the next iteration halts. (A single completing turn is
        // never retroactively halted — the guard bounds runaway multi-step runs.)
        const deps = makeDeps({
            turns: [{ toolCalls: [call('c', 'readPage')], billedTokens: 5000 }, { text: 'y' }],
            costCeiling: 1000,
        })
        const events = await collect(driveEngine(cp, deps))
        expect(events.some((e) => e.type === 'halted' && e.reason === 'budget')).toBe(true)
    })

    it('emits error + finishes failed when the model throws', async () => {
        const cp = freshCp()
        const deps = makeDeps({ turns: [] })
        deps.callModel = async () => {
            throw new Error('provider exploded') 
        }
        const events = await collect(driveEngine(cp, deps))
        expect(events.at(-1)).toMatchObject({ type: 'error', message: 'provider exploded' })
        expect(deps.finish).toHaveBeenCalledWith(expect.anything(), 'failed', 'provider exploded')
    })
})
