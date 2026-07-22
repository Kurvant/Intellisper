import { describe, expect, it } from 'vitest'
import type { RunCheckpoint } from '../../../../src/app/browser-agent/engine/agent-engine.types'
import { tierRouter } from '../../../../src/app/browser-agent/engine/tier-router'
import { browserAgentModelConfig } from '../../../../src/app/browser-agent/model-provider/model-provider.config'
import { mapUsage } from '../../../../src/app/browser-agent/model-provider/model-provider.service'

describe('mapUsage — cost-faithful billed tokens', () => {
    it('bills uncached input fully + cached input at 0.1 + all output', async () => {
        // 1000 input of which 800 cached, 500 output:
        //   uncached = 200; billed = 200 + 800*0.1 + 500 = 780
        const u = mapUsage({ inputTokens: 1000, outputTokens: 500, cachedInputTokens: 800, totalTokens: 1500 })
        expect(u.billedTokens).toBe(780)
        expect(u.promptTokens).toBe(1000)
        expect(u.completionTokens).toBe(500)
        expect(u.cachedInputTokens).toBe(800)
    })

    it('with no cache, billed == input + output', async () => {
        const u = mapUsage({ inputTokens: 300, outputTokens: 100 })
        expect(u.billedTokens).toBe(400)
        expect(u.totalTokens).toBe(400)
    })

    it('handles all-undefined usage as zero', async () => {
        const u = mapUsage({})
        expect(u.billedTokens).toBe(0)
        expect(u.totalTokens).toBe(0)
    })
})

describe('tierRouter.pickTier — stall-based routing', () => {
    const cp = (stalls: number): RunCheckpoint => ({
        loopState: null, finalText: '', totalTokens: 0, steps: 0, page: null,
        escalation: { consecutiveStalls: stalls, escalations: 0, reasoningEscalations: 0 },
    })

    it('0 stalls → default', () => {
        expect(tierRouter.pickTier(cp(0), true)).toBe('default')
        expect(tierRouter.pickTier({ ...cp(0), escalation: undefined }, true)).toBe('default')
    })
    it('1 stall → escalation', () => {
        expect(tierRouter.pickTier(cp(1), true)).toBe('escalation')
    })
    it('2+ stalls → reasoning ONLY when allowed', () => {
        expect(tierRouter.pickTier(cp(2), true)).toBe('reasoning')
        expect(tierRouter.pickTier(cp(3), true)).toBe('reasoning')
        expect(tierRouter.pickTier(cp(2), false)).toBe('escalation')
    })
})

describe('tierRouter.recordTurnOutcome', () => {
    it('productive turn resets stalls; empty turn increments + counts the escalation', () => {
        const cp: RunCheckpoint = { loopState: null, finalText: '', totalTokens: 0, steps: 0, page: null }
        tierRouter.recordTurnOutcome(cp, 'default', false) // stall on default → escalations++
        expect(cp.escalation).toMatchObject({ consecutiveStalls: 1, escalations: 1 })
        tierRouter.recordTurnOutcome(cp, 'escalation', false) // stall on escalation → reasoningEscalations++
        expect(cp.escalation).toMatchObject({ consecutiveStalls: 2, reasoningEscalations: 1 })
        tierRouter.recordTurnOutcome(cp, 'reasoning', true) // productive → reset
        expect(cp.escalation!.consecutiveStalls).toBe(0)
    })
})

describe('browserAgentModelConfig.tierModel — defaults', () => {
    it('maps each tier to its default provider + model', () => {
        expect(browserAgentModelConfig.tierModel('default')).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' })
        expect(browserAgentModelConfig.tierModel('escalation')).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
        expect(browserAgentModelConfig.tierModel('reasoning')).toEqual({ provider: 'anthropic', model: 'claude-opus-4-6' })
        expect(browserAgentModelConfig.tierModel('fallback')).toEqual({ provider: 'openai', model: 'gpt-4o' })
        expect(browserAgentModelConfig.tierModel('distill')).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' })
    })
})
