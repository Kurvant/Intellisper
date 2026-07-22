import { FastifyBaseLogger } from 'fastify'
import { browserAgentModelProvider } from '../model-provider/model-provider.service'

/**
 * Grammar/proofreading quick-tool. Bypasses the agent loop: one distill-tier call returns the
 * corrected text + edit types, but the highlight RANGES are computed deterministically via a
 * token-level LCS diff — the model's character offsets are never trusted (they drift). The model's
 * edits only supply the `type` label for each change.
 */
const MAX_INPUT_CHARS = 12_000

export type GrammarEdit = {
    start: number
    end: number
    original: string
    replacement: string
    type: string
}

export type GrammarResult = {
    corrected: string
    edits: GrammarEdit[]
    tokensUsed: number
}

export const browserAgentGrammar = (log: FastifyBaseLogger) => ({
    async check(rawText: string, platformId?: string): Promise<GrammarResult> {
        const text = rawText.slice(0, MAX_INPUT_CHARS)
        if (!text.trim()) return { corrected: text, edits: [], tokensUsed: 0 }

        const turn = await browserAgentModelProvider(log, platformId).callWithTools({
            tier: 'distill',
            system: 'You are a proofreader. Return ONLY a JSON object {"corrected": string, "edits": [{"original": string, "replacement": string, "type": "spelling"|"grammar"|"punctuation"|"style"}]}. Fix spelling, grammar, and punctuation; keep the meaning. If nothing needs fixing, return the text unchanged with an empty edits array.',
            messages: [{ role: 'user', content: text }],
            tools: [],
            maxTokens: 4096,
        })

        const parsed = parseModel(turn.text ?? '')
        // Defensive: a missing OR empty `corrected` means "no usable correction" → fall back to the
        // original (never diff the whole text to a deletion). An identical corrected → no edits.
        const corrected = parsed?.corrected && parsed.corrected.trim().length > 0 ? parsed.corrected : text
        const typeLookup = buildTypeLookup(parsed?.edits ?? [])
        const edits = corrected === text ? [] : diffEdits(text, corrected, typeLookup)
        return { corrected, edits, tokensUsed: turn.usage.billedTokens }
    },
})

function parseModel(raw: string): { corrected?: string, edits?: Array<{ original?: string, replacement?: string, type?: string }> } | null {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
        return JSON.parse(m[0])
    }
    catch {
        return null
    }
}

function buildTypeLookup(edits: Array<{ original?: string, replacement?: string, type?: string }>): Map<string, string> {
    const map = new Map<string, string>()
    for (const e of edits) {
        if (typeof e.original === 'string' && typeof e.replacement === 'string') {
            map.set(`${e.original}→${e.replacement}`, e.type ?? 'grammar')
        }
    }
    return map
}

// ── Deterministic token-level diff (never trust model offsets) ─────────────────────────────────

function tokenize(s: string): string[] {
    // Split into words + whitespace/punctuation runs, preserving positions when re-joined.
    return s.match(/\s+|[^\s]+/g) ?? []
}

function diffEdits(original: string, corrected: string, typeLookup: Map<string, string>): GrammarEdit[] {
    const a = tokenize(original)
    const b = tokenize(corrected)
    const dp = lcsMatrix(a, b)
    const edits: GrammarEdit[] = []

    let i = 0
    let j = 0
    let pos = 0 // char offset into `original`
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
            pos += a[i].length
            i++
            j++
            continue
        }
        // A non-matching region: consume BOTH sides (deletions from a, insertions from b) into a
        // single contiguous edit, using the LCS to decide which side to advance, until we resync on a
        // common token (or exhaust both). The `|| j<b.length` / `|| i<a.length` guards let the region
        // keep collecting when one side is exhausted mid-substitution (avoids splitting into two edits).
        const start = pos
        let del = ''
        let ins = ''
        while ((i < a.length || j < b.length) && !(i < a.length && j < b.length && a[i] === b[j])) {
            const canDel = i < a.length
            const canIns = j < b.length
            const preferDel = canDel && (!canIns || dp[i + 1][j] >= dp[i][j + 1])
            if (preferDel) {
                del += a[i]
                pos += a[i].length
                i++
            }
            else {
                ins += b[j]
                j++
            }
        }
        pushEdit(edits, start, del, ins, typeLookup)
    }
    return edits
}

function pushEdit(edits: GrammarEdit[], start: number, del: string, ins: string, typeLookup: Map<string, string>): void {
    if (!del.length && !ins.length) return
    edits.push({ start, end: start + del.length, original: del, replacement: ins, type: typeLookup.get(`${del.trim()}→${ins.trim()}`) ?? 'grammar' })
}

function lcsMatrix(a: string[], b: string[]): number[][] {
    const m = a.length
    const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
        }
    }
    return dp
}
