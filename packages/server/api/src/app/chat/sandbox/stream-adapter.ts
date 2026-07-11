// Clean-room implementation — sandbox → client stream adapter (capability spec H.2.a/H.2.d).
//
// Translates the sandbox agent's `SandboxSessionUpdateType` events into the client's
// UI-message-stream protocol parts (text-*, reasoning-*, tool-*, data-*). Two collaborators:
//
//   - createHistoryReplayFilter(): a small state machine that suppresses the internal
//     "history replay" preamble the agent runtime emits when resuming a session, so it never
//     reaches the user. It fails open (passthrough) rather than risk swallowing real content.
//   - createStreamWriter(): a stateful writer that opens/closes text & reasoning parts around
//     tool calls and maps every event type to the corresponding stream part(s).
import { chatEventUtils } from './ai-event-utils'
import { SandboxSessionUpdateType } from './sandbox-agent'

// ---------------------------------------------------------------------------
// History replay filter
// ---------------------------------------------------------------------------

// While DETECTING we accumulate up to this many characters looking for replay markers before
// giving up and passing everything through (a real answer that never looked like replay).
const DETECTION_BUFFER_LIMIT = 500
// While SUPPRESSING we tolerate this many characters of non-replay text before concluding the
// replay is over and switching to passthrough (guards against permanently eating real output).
const SUPPRESSION_BUFFER_LIMIT = 200

enum ReplayFilterState {
    DETECTING = 'detecting',
    SUPPRESSING = 'suppressing',
    PASSTHROUGH = 'passthrough',
}

type StreamUpdate = Record<string, unknown>

function isTextChunk(update: StreamUpdate): boolean {
    return update['sessionUpdate'] === SandboxSessionUpdateType.AGENT_MESSAGE_CHUNK
}

export type HistoryReplayFilter = {
    // Returns true when the update should be suppressed (not forwarded to the client).
    shouldSuppress: (update: StreamUpdate) => boolean
}

export function createHistoryReplayFilter(): HistoryReplayFilter {
    let state = ReplayFilterState.DETECTING
    let detectionBuffer = ''
    let suppressionBuffer = ''

    return {
        shouldSuppress(update: StreamUpdate): boolean {
            // Once passthrough, everything flows unchanged forever.
            if (state === ReplayFilterState.PASSTHROUGH) {
                return false
            }

            // Only assistant text participates in replay detection; every other event type
            // (tool calls, plans, usage, ...) always passes through regardless of state.
            if (!isTextChunk(update)) {
                return false
            }
            const text = chatEventUtils.extractContentText(update)
            if (text === undefined) {
                return false
            }

            if (state === ReplayFilterState.DETECTING) {
                detectionBuffer += text
                if (chatEventUtils.isHistoryReplayContent(detectionBuffer)) {
                    state = ReplayFilterState.SUPPRESSING
                    suppressionBuffer = ''
                    return true
                }
                if (detectionBuffer.length > DETECTION_BUFFER_LIMIT) {
                    // Looked long enough and it never resembled replay — treat as real content.
                    state = ReplayFilterState.PASSTHROUGH
                    return false
                }
                return false
            }

            // SUPPRESSING: keep eating replay content; give up if we accumulate too much
            // non-replay text (the replay has ended and real output has started).
            if (chatEventUtils.isHistoryReplayContent(text)) {
                return true
            }
            suppressionBuffer += text
            if (suppressionBuffer.length > SUPPRESSION_BUFFER_LIMIT) {
                state = ReplayFilterState.PASSTHROUGH
                return false
            }
            return true
        },
    }
}

// ---------------------------------------------------------------------------
// Stream writer
// ---------------------------------------------------------------------------

// Minimal shape of the UI-message-stream writer we depend on.
type UIMessageStreamWriter = {
    write: (part: Record<string, unknown>) => void
}

export type StreamWriter = {
    write: (update: StreamUpdate) => void
}

type CreateStreamWriterParams = {
    writer: UIMessageStreamWriter
    textPartId: string
    reasoningPartId: string
    onSessionTitle?: (title: string) => void
}

// Translates sandbox session updates into client stream parts. Text and reasoning are
// streamed as start/delta pairs (start emitted lazily on the first delta); a tool call closes
// whichever of those is open before emitting its own parts, matching the client protocol's
// requirement that parts be properly opened and closed.
export function createStreamWriter(params: CreateStreamWriterParams): StreamWriter {
    const { writer, textPartId, reasoningPartId, onSessionTitle } = params

    let textStarted = false
    let reasoningStarted = false

    function closeOpenParts(): void {
        if (textStarted) {
            writer.write({ type: 'text-end', id: textPartId })
            textStarted = false
        }
        if (reasoningStarted) {
            writer.write({ type: 'reasoning-end', id: reasoningPartId })
            reasoningStarted = false
        }
    }

    function handleMessageChunk(update: StreamUpdate): void {
        const text = chatEventUtils.extractContentText(update)
        if (text === undefined) {
            return
        }
        if (!textStarted) {
            writer.write({ type: 'text-start', id: textPartId })
            textStarted = true
        }
        writer.write({ type: 'text-delta', id: textPartId, delta: text })
    }

    function handleThoughtChunk(update: StreamUpdate): void {
        const text = chatEventUtils.extractContentText(update)
        if (text === undefined) {
            return
        }
        if (!reasoningStarted) {
            writer.write({ type: 'reasoning-start', id: reasoningPartId })
            reasoningStarted = true
        }
        writer.write({ type: 'reasoning-delta', id: reasoningPartId, delta: text })
    }

    function handleToolCall(update: StreamUpdate): void {
        closeOpenParts()
        const toolCallId = update['toolCallId']
        const toolName = update['title']
        const input = update['rawInput'] ?? {}
        writer.write({ type: 'tool-input-start', toolCallId, toolName })
        writer.write({ type: 'tool-input-available', toolCallId, toolName, input })
    }

    function handleToolCallUpdate(update: StreamUpdate): void {
        if (update['status'] !== 'completed') {
            return
        }
        const output = chatEventUtils.extractToolOutput(update)
        writer.write({
            type: 'tool-output-available',
            toolCallId: update['toolCallId'],
            output,
        })
    }

    function handleSessionInfoUpdate(update: StreamUpdate): void {
        const title = update['title']
        if (typeof title !== 'string' || title.length === 0) {
            return
        }
        writer.write({ type: 'data-session-title', data: { title } })
        onSessionTitle?.(title)
    }

    function handlePlan(update: StreamUpdate): void {
        const entries = update['entries']
        if (!Array.isArray(entries)) {
            return
        }
        const mapped = entries.map((entry) => {
            const record = (typeof entry === 'object' && entry !== null) ? entry as Record<string, unknown> : {}
            return { content: record['content'], status: record['status'] }
        })
        writer.write({ type: 'data-plan', data: { entries: mapped } })
    }

    function handleUsageUpdate(update: StreamUpdate): void {
        const inputTokens = typeof update['inputTokens'] === 'number'
            ? update['inputTokens'] as number
            : (typeof update['used'] === 'number' ? update['used'] as number : 0)
        const outputTokens = typeof update['outputTokens'] === 'number' ? update['outputTokens'] as number : 0
        writer.write({ type: 'data-usage', data: { inputTokens, outputTokens } })
    }

    return {
        write(update: StreamUpdate): void {
            switch (update['sessionUpdate']) {
                case SandboxSessionUpdateType.AGENT_MESSAGE_CHUNK:
                    handleMessageChunk(update)
                    break
                case SandboxSessionUpdateType.AGENT_THOUGHT_CHUNK:
                    handleThoughtChunk(update)
                    break
                case SandboxSessionUpdateType.TOOL_CALL:
                    handleToolCall(update)
                    break
                case SandboxSessionUpdateType.TOOL_CALL_UPDATE:
                    handleToolCallUpdate(update)
                    break
                case SandboxSessionUpdateType.SESSION_INFO_UPDATE:
                    handleSessionInfoUpdate(update)
                    break
                case SandboxSessionUpdateType.PLAN:
                    handlePlan(update)
                    break
                case SandboxSessionUpdateType.USAGE_UPDATE:
                    handleUsageUpdate(update)
                    break
                default:
                    // Unrecognized or missing sessionUpdate — emit nothing.
                    break
            }
        },
    }
}
