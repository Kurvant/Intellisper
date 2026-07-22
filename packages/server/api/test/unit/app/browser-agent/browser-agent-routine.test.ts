import { AgentActionStatus, RoutineParamType } from '@intelblocks/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routine service unit tests (Phase 7): record-from-run capture, one-click param inference, and the
 * pure buildReplayPlan (required-param validation + {{placeholder}} substitution incl. nested config).
 * The repo layer + transaction are mocked so we exercise the LOGIC without a DB.
 */

// A tiny in-memory repo double: each entity gets its own store keyed by EntitySchema name. Declared
// via vi.hoisted so it exists before the hoisted vi.mock factory (and module-level repoFactory calls).
const { repos, makeRepo } = vi.hoisted(() => {
    const store: Record<string, Record<string, ReturnType<typeof vi.fn>> & { create: (x: unknown) => unknown }> = {}
    const make = () => ({
        find: vi.fn().mockResolvedValue([]),
        findOneBy: vi.fn().mockResolvedValue(null),
        countBy: vi.fn().mockResolvedValue(0),
        save: vi.fn().mockImplementation(async (x: unknown) => x),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
        createQueryBuilder: vi.fn(),
        create: (x: unknown) => x,
    })
    return { repos: store, makeRepo: make }
})

// Map entity → a stable repo double by the entity's EntitySchema name.
vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: (entity: { options?: { name?: string } }) => {
        const name = entity?.options?.name ?? 'unknown'
        if (!repos[name]) repos[name] = makeRepo() as never
        return () => repos[name]
    },
}))

vi.mock('../../../../src/app/core/db/transaction', () => ({
    transaction: async (op: (em: unknown) => Promise<unknown>) => op({ update: vi.fn(), delete: vi.fn() }),
}))

// agentScope stubbed to the real owner-filter shape (the enforcement gate covers the real thing).
vi.mock('../../../../src/app/browser-agent/scope/agent-scope', () => ({
    agentScope: {
        ownerFilter: (ctx: { platformId: string, userId: string }) => ({ platformId: ctx.platformId, userId: ctx.userId }),
        applyRead: (qb: unknown) => qb,
    },
}))

import { browserAgentRoutine } from '../../../../src/app/browser-agent/routine/browser-agent-routine.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const svc = () => browserAgentRoutine(log)
const scope = { userId: 'u1', platformId: 'p1', projectId: 'proj1' }

const R = () => ({
    routine: () => repos['browser_agent_routine'],
    step: () => repos['browser_agent_routine_step'],
    run: () => repos['browser_agent_run'],
    conv: () => repos['browser_agent_conversation'],
    action: () => repos['browser_agent_action'],
    history: () => repos['browser_agent_routine_run'],
})

// Ensure every repo double the service touches exists and is reset to defaults before each test.
const REPO_NAMES = ['browser_agent_routine', 'browser_agent_routine_step', 'browser_agent_run', 'browser_agent_conversation', 'browser_agent_action', 'browser_agent_routine_run']
beforeEach(() => {
    for (const name of REPO_NAMES) {
        if (!repos[name]) repos[name] = makeRepo() as never
        const r = repos[name]
        r.find.mockReset().mockResolvedValue([])
        r.findOneBy.mockReset().mockResolvedValue(null)
        r.countBy.mockReset().mockResolvedValue(0)
        r.save.mockReset().mockImplementation(async (x: unknown) => x)
        r.update.mockReset().mockResolvedValue({ affected: 1 })
        r.createQueryBuilder.mockReset()
    }
})

// ── buildReplayPlan (pure) ───────────────────────────────────────────────────────────────────────

describe('buildReplayPlan', () => {
    const routine = {
        id: 'r1', name: 'X', params: [
            { name: 'email', label: 'Email', type: RoutineParamType.EMAIL, required: true, options: null, default: null },
            { name: 'note', label: 'Note', type: RoutineParamType.TEXT, required: false, options: null, default: null },
        ],
    } as never

    const steps = [
        { ordinal: 0, action: 'type', intent: 'Type email', config: null, locators: { recordedArgs: { text: '{{email}}', field: 'Email' } } },
        { ordinal: 1, action: 'type', intent: 'Type note', config: null, locators: { recordedArgs: { text: 'Hi {{note}}!' } } },
    ] as never

    it('substitutes {{placeholders}} from the caller values', () => {
        const plan = svc().buildReplayPlan(routine, steps, { email: 'a@b.com', note: 'there' })
        expect(plan[0].args.text).toBe('a@b.com')
        expect(plan[1].args.text).toBe('Hi there!')
    })

    it('throws when a REQUIRED param is missing/blank', () => {
        expect(() => svc().buildReplayPlan(routine, steps, { note: 'x' })).toThrow()
        expect(() => svc().buildReplayPlan(routine, steps, { email: '   ' })).toThrow()
    })

    it('leaves an unresolved placeholder intact when its (optional) value is absent', () => {
        const plan = svc().buildReplayPlan(routine, steps, { email: 'a@b.com' })
        expect(plan[1].args.text).toBe('Hi {{note}}!')
    })

    it('substitutes into nested condition/extract config too', () => {
        const withCfg = [{ ordinal: 0, action: 'condition', intent: 'c', locators: { recordedArgs: {} }, config: { assert: 'textMatches', expect: '{{email}}', target: { fieldLabel: '{{email}}' } } }] as never
        const plan = svc().buildReplayPlan({ ...routine, params: [{ name: 'email', label: 'E', type: RoutineParamType.TEXT, required: true, options: null, default: null }] } as never, withCfg, { email: 'zzz' })
        expect(plan[0].config?.expect).toBe('zzz')
        expect((plan[0].config?.target as { fieldLabel: string }).fieldLabel).toBe('zzz')
    })
})

// ── recordFromRun ─────────────────────────────────────────────────────────────────────────────────

describe('recordFromRun', () => {
    function ownRun() {
        R().run().findOneBy.mockResolvedValue({ id: 'run1', conversationId: 'c1' })
        R().conv().findOneBy.mockResolvedValue({ id: 'c1', title: 'Fill the form' })
    }

    it('captures only EXECUTED replayable browser actions, in order, with locators + intent', async () => {
        ownRun()
        R().action().find.mockResolvedValue([
            { type: 'navigate', targetRef: null, args: { url: 'https://x.com' }, result: {} },
            { type: 'readPage', targetRef: 'r0', args: {}, result: {} }, // server tool → skipped
            { type: 'type', targetRef: 'r5', args: { text: 'hi', field: 'Name', description: 'Type the name' }, result: { fieldLabel: 'Name' } },
            { type: 'submitForm', targetRef: null, args: {}, result: {} },
        ])
        const savedSteps: unknown[] = []
        R().step().save.mockImplementation(async (steps: unknown[]) => { savedSteps.push(...steps); return steps })

        const { routine, stepCount } = await svc().recordFromRun(scope, 'run1', 'My routine')
        expect(routine.name).toBe('My routine')
        expect(stepCount).toBe(3) // navigate, type, submitForm — readPage dropped
        const actions = (savedSteps as Array<{ action: string, ordinal: number, locators: Record<string, unknown> }>)
        expect(actions.map((s) => s.action)).toEqual(['navigate', 'type', 'submitForm'])
        expect(actions.map((s) => s.ordinal)).toEqual([0, 1, 2])
        expect(actions[0].locators.url).toBe('https://x.com')
        expect(actions[1].locators.fieldLabel).toBe('Name')
        expect((actions[1].locators.recordedArgs as { text: string }).text).toBe('hi')
    })

    it('rejects a run with NO replayable actions', async () => {
        ownRun()
        R().action().find.mockResolvedValue([{ type: 'readPage', targetRef: null, args: {}, result: {} }])
        await expect(svc().recordFromRun(scope, 'run1', 'X')).rejects.toThrow()
    })

    it('rejects when the run is not owned by the caller', async () => {
        R().run().findOneBy.mockResolvedValue(null)
        await expect(svc().recordFromRun(scope, 'runX', 'X')).rejects.toThrow()
    })

    it('rejects when the per-user routine cap is reached', async () => {
        ownRun()
        R().routine().countBy.mockResolvedValue(100)
        R().action().find.mockResolvedValue([{ type: 'click', targetRef: 'r1', args: {}, result: {} }])
        await expect(svc().recordFromRun(scope, 'run1', 'X')).rejects.toThrow()
    })
})

// ── one-click param inference ──────────────────────────────────────────────────────────────────────

describe('saveFromRunAuto — param inference', () => {
    beforeEach(() => {
        R().run().findOneBy.mockResolvedValue({ id: 'run1', conversationId: 'c1' })
        R().conv().findOneBy.mockResolvedValue({ id: 'c1', title: 'This is a contact form. Fill it in' })
    })

    it('derives a clean name, infers a param per distinct typed value, and rewrites the step arg', async () => {
        R().action().find.mockResolvedValue([
            { type: 'type', targetRef: 'r1', args: { text: 'alice@example.com', field: 'Email' }, result: {} },
            { type: 'selectOption', targetRef: 'r2', args: { value: 'Gold', field: 'Tier' }, result: { fieldOptions: ['Bronze', 'Gold'] } },
        ])
        // recordFromRun path: steps are saved as an array first…
        const stepStore: Array<Record<string, unknown>> = []
        R().step().save.mockImplementation(async (s: unknown) => {
            if (Array.isArray(s)) stepStore.push(...(s as Array<Record<string, unknown>>))
            else stepStore.push(s as Record<string, unknown>)
            return s
        })
        // …then inferAndApplyParams re-reads them ordered.
        R().step().find.mockImplementation(async () => stepStore.filter((s) => 'action' in s))
        R().routine().findOneBy.mockResolvedValue({ id: 'r1', name: 'X', params: [] })

        const { inferredParams } = await svc().saveFromRunAuto(scope, 'run1')
        expect(inferredParams.length).toBe(2)
        // The routine's params were updated with the inferred set.
        const paramsUpdate = R().routine().update.mock.calls.find((c: unknown[]) => (c[1] as { params?: unknown }).params)
        expect(paramsUpdate).toBeTruthy()
        const params = (paramsUpdate![1] as { params: Array<{ type: string, options?: string[] }> }).params
        // The email step → EMAIL type; the select step → SELECT type carrying options.
        expect(params.some((p) => p.type === RoutineParamType.EMAIL)).toBe(true)
        const sel = params.find((p) => p.type === RoutineParamType.SELECT)
        expect(sel?.options).toContain('Gold')
    })

    it('skips secret-ish / too-short typed values (no param, arg left as-is)', async () => {
        R().action().find.mockResolvedValue([
            { type: 'type', targetRef: 'r1', args: { text: 'x' }, result: {} }, // 1 char → skipped
        ])
        const stepStore: Array<Record<string, unknown>> = []
        R().step().save.mockImplementation(async (s: unknown) => { if (Array.isArray(s)) stepStore.push(...(s as never[])); else stepStore.push(s as never); return s })
        R().step().find.mockImplementation(async () => stepStore.filter((s) => 'action' in s))
        R().routine().findOneBy.mockResolvedValue({ id: 'r1', name: 'X', params: [] })

        const { inferredParams } = await svc().saveFromRunAuto(scope, 'run1')
        expect(inferredParams).toEqual([])
    })
})
