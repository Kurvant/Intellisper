import { z } from 'zod'

export const BrowserAgentGrammarRequest = z.object({
    projectId: z.string(),
    text: z.string().min(1).max(12000),
})
export type BrowserAgentGrammarRequest = z.infer<typeof BrowserAgentGrammarRequest>

export const GrammarEditView = z.object({
    start: z.number(),
    end: z.number(),
    original: z.string(),
    replacement: z.string(),
    type: z.string(),
})
export type GrammarEditView = z.infer<typeof GrammarEditView>

export const BrowserAgentGrammarResponse = z.object({
    corrected: z.string(),
    edits: z.array(GrammarEditView),
    tokensUsed: z.number(),
})
export type BrowserAgentGrammarResponse = z.infer<typeof BrowserAgentGrammarResponse>
