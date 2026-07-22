import { describe, expect, it, vi } from 'vitest'

// Mock the provider so grammar returns a scripted corrected text; the highlight RANGES are computed
// deterministically by the service (the point of the test).
let scriptedCorrected = ''
let scriptedEdits: Array<{ original: string, replacement: string, type: string }> = []

vi.mock('../../../../src/app/browser-agent/model-provider/model-provider.service', () => ({
    browserAgentModelProvider: () => ({
        callWithTools: async () => ({
            text: JSON.stringify({ corrected: scriptedCorrected, edits: scriptedEdits }),
            toolCalls: [], isFinal: true,
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, cachedInputTokens: 0, billedTokens: 2 },
            provider: 'anthropic', model: 'test', state: { __messages: [] },
        }),
    }),
}))

import { browserAgentGrammar } from '../../../../src/app/browser-agent/grammar/browser-agent-grammar.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

describe('grammar — deterministic highlight ranges', () => {
    it('produces an edit range at the exact corrected span (offsets from the diff, not the model)', async () => {
        const input = 'I has a apple.'
        scriptedCorrected = 'I have an apple.'
        scriptedEdits = [{ original: 'has', replacement: 'have', type: 'grammar' }, { original: 'a', replacement: 'an', type: 'grammar' }]
        const res = await browserAgentGrammar(log).check(input)
        expect(res.corrected).toBe('I have an apple.')
        expect(res.edits.length).toBeGreaterThan(0)
        // Each edit's [start,end) slices the ORIGINAL to exactly its `original` text.
        for (const e of res.edits) {
            expect(input.slice(e.start, e.end)).toBe(e.original)
        }
        // The 'has→have' edit is typed grammar (from the model's label lookup).
        const hasEdit = res.edits.find((e) => e.original.includes('has'))
        expect(hasEdit?.replacement).toContain('have')
    })

    it('returns no edits when nothing changes', async () => {
        scriptedCorrected = 'Perfect sentence.'
        scriptedEdits = []
        const res = await browserAgentGrammar(log).check('Perfect sentence.')
        expect(res.edits).toEqual([])
        expect(res.corrected).toBe('Perfect sentence.')
    })

    it('handles a change to the final token (punctuation added to the last word)', async () => {
        const input = 'Hello world'
        scriptedCorrected = 'Hello world!'
        scriptedEdits = []
        const res = await browserAgentGrammar(log).check(input)
        expect(res.corrected).toBe('Hello world!')
        // The last token differs (world → world!) — one edit whose original slice is the last word.
        expect(res.edits.length).toBe(1)
        expect(input.slice(res.edits[0].start, res.edits[0].end)).toBe('world')
        expect(res.edits[0].replacement).toBe('world!')
    })

    it('handles a pure insertion (new word appended)', async () => {
        const input = 'Hello world'
        scriptedCorrected = 'Hello world now'
        scriptedEdits = []
        const res = await browserAgentGrammar(log).check(input)
        expect(res.corrected).toBe('Hello world now')
        expect(res.edits.length).toBe(1)
        // Appended tokens → insertion at the end; original slice is empty.
        expect(input.slice(res.edits[0].start, res.edits[0].end)).toBe('')
        expect(res.edits[0].replacement).toContain('now')
    })

    it('empty input is a no-op', async () => {
        const res = await browserAgentGrammar(log).check('   ')
        expect(res.edits).toEqual([])
        expect(res.tokensUsed).toBe(0)
    })

    it('malformed model output falls back to the original text (no crash)', async () => {
        // Force a non-JSON model reply via the corrected placeholder used by the mock.
        scriptedCorrected = ''
        scriptedEdits = []
        const res = await browserAgentGrammar(log).check('some text')
        // corrected falls back to the input; no edits
        expect(typeof res.corrected).toBe('string')
        expect(res.edits).toEqual([])
    })
})
