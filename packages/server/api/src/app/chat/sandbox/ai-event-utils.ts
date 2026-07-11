// Clean-room implementation — sandbox event parsing helpers (capability spec H.2.a/H.2.d).
//
// The sandbox agent emits loosely-typed session-update objects over the wire; these helpers
// safely extract the blocks the stream adapter cares about (assistant text, tool output) and
// detect "history replay" preamble that the underlying agent runtime replays at session start.
//
// Every accessor is defensive: the shapes come from an external runtime, so anything that is
// not exactly the expected type yields `undefined`/`false` rather than throwing.

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

// Extract the assistant text from an `{ content: { type: 'text', text: string } }` update.
// Returns undefined for any other shape (missing content, non-object content, wrong type,
// or a non-string text field). An empty string is a valid result and is returned as-is.
function extractContentText(update: Record<string, unknown>): string | undefined {
    const content = update['content']
    if (!isRecord(content)) {
        return undefined
    }
    if (content['type'] !== 'text') {
        return undefined
    }
    const text = content['text']
    if (typeof text !== 'string') {
        return undefined
    }
    return text
}

// The underlying agent runtime replays prior session history at the start of a resumed
// session. That replay leaks the raw JSON-RPC session/update envelopes (and truncation
// markers) into the text stream; we detect it so the stream adapter can suppress it and
// avoid echoing internal protocol noise to the user.
const REPLAY_MARKERS = [
    'Previous session history is replayed below',
    '[history truncated]',
]

function isHistoryReplayContent(text: string): boolean {
    if (text.length === 0) {
        return false
    }
    // Raw JSON-RPC session/update envelope leaking through the text channel.
    if (text.includes('jsonrpc') && text.includes('session/update')) {
        return true
    }
    // Explicit replay/truncation banners.
    if (REPLAY_MARKERS.some((marker) => text.includes(marker))) {
        return true
    }
    // A serialized history event object carries all of these keys together.
    if (
        text.includes('createdAt')
        && text.includes('sender')
        && text.includes('payload')
        && text.includes('method')
    ) {
        return true
    }
    return false
}

// Extract the textual output of a completed tool call. Prefer the runtime's flat `rawOutput`
// string; otherwise concatenate the text blocks of a `content` array. Returns undefined when
// no textual output can be recovered.
function extractToolOutput(update: Record<string, unknown>): string | undefined {
    const rawOutput = update['rawOutput']
    if (typeof rawOutput === 'string') {
        return rawOutput
    }
    if (rawOutput !== undefined) {
        // rawOutput present but not a string — fall through to content only if content exists.
        return undefined
    }

    const content = update['content']
    if (!Array.isArray(content)) {
        return undefined
    }
    const textBlocks: string[] = []
    for (const block of content) {
        if (isRecord(block) && block['type'] === 'text' && typeof block['text'] === 'string') {
            textBlocks.push(block['text'])
        }
    }
    if (textBlocks.length === 0) {
        return undefined
    }
    return textBlocks.join('\n')
}

export const chatEventUtils = {
    extractContentText,
    isHistoryReplayContent,
    extractToolOutput,
}
