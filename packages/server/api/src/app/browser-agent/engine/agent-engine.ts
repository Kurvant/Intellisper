import type { ModelTier } from '../model-provider/model-provider.config'
import type {
    ProviderToolCall,
    ProviderToolDef,
    ProviderToolResult,
} from '../model-provider/model-provider.types'
import type { AgentEvent, RunCheckpoint } from './agent-engine.types'
import { tierRouter } from './tier-router'

/**
 * The PURE agent engine. It drives the resumable tool-calling loop over a checkpoint, yielding
 * AgentEvents, and PAUSES (returns) whenever a browser action must be executed by the extension.
 * It has ZERO transport/DB/Fastify coupling — everything external is injected via `EngineDeps`.
 * This is what makes it hostable in the API process now and liftable to a worker later unchanged.
 *
 * Control-flow contract (mirrors the resumable action loop):
 *  - It consults the model for ONE turn at a time (deps.callModel), never looping inside the SDK.
 *  - Server tools execute inline (deps.executeServerTool) and their results feed the next turn.
 *  - Extension tools are persisted as an action (deps.persistAction) and cause a PAUSE: the engine
 *    yields the action/awaiting_confirmation event and RETURNS. The host resumes by calling the
 *    engine again after the observation is recorded into the checkpoint (pendingCalls/gatheredResults).
 *  - Every mutation to the checkpoint is flushed via deps.persist so a fresh replica can resume.
 */
export type EngineToolClass = 'safe' | 'reversible' | 'consequential'

export type ServerToolOutcome =
    | { kind: 'server', ok: boolean, observation: Record<string, unknown>, error?: string, researchSource?: { via: 'fetch' | 'tab', url: string, title: string, gathered: number, sourceCap: number } }
    // The tool must run in the extension; the host has persisted an action with this id.
    | { kind: 'extension', actionId: string, actionClass: EngineToolClass }
    // A research source tool would exceed the per-run source budget → pause for a user-confirmed
    // expansion. The host has recorded the budget state; the engine emits awaiting_expansion + the
    // pending batch, exactly like an extension pause, and RETURNS.
    | { kind: 'await_expansion', gathered: number, sourceCap: number, expandBy: number, canExpand: boolean }

export type EngineDeps = {
    runId: string
    conversationId: string
    systemPrompt: string
    /** Seed messages for the first model turn (used only when loopState is null). */
    seedMessages: unknown[]
    /** Tool definitions offered to the model this run. */
    toolDefs: ProviderToolDef[]
    /** Whether this run may reach the reasoning (Opus) tier. */
    reasoningAllowed: boolean
    maxSteps: number
    costCeiling: number

    /** One model turn. The engine passes the tier + carried state; the facade does the SDK call. */
    callModel: (input: {
        tier: ModelTier
        loopState: RunCheckpoint['loopState']
        seedMessages: unknown[]
        toolDefs: ProviderToolDef[]
        toolResults?: ProviderToolResult[]
        /** The engine's persisted step index — used to build a resume-stable AI-ledger idempotency key. */
        step?: number
    }) => Promise<{
        text: string
        toolCalls: ProviderToolCall[]
        isFinal: boolean
        billedTokens: number
        state: RunCheckpoint['loopState']
    }>

    /**
     * Dispatch a single tool call. SERVER tools execute inline and return an outcome; EXTENSION
     * tools are persisted by the host (which returns the action id) and cause a pause.
     */
    dispatchTool: (call: ProviderToolCall) => Promise<ServerToolOutcome>

    /** Persist the checkpoint (source of truth for replica-safe resume). */
    persist: (cp: RunCheckpoint) => Promise<void>

    /** Human-facing label + summary for an action (host-provided; keeps copy out of the engine). */
    labelFor: (toolName: string) => string
    summaryFor: (call: ProviderToolCall) => string
    classOf: (toolName: string) => EngineToolClass

    /** Terminal hook — persist final status. reason is null for a clean completion. */
    finish: (cp: RunCheckpoint, status: 'completed' | 'halted' | 'failed', reason: string | null) => Promise<void>

    /**
     * Turn a thrown error into the user-facing message for the terminal `error` event, and log it.
     * Injected because the engine is transport/infra-free: it cannot know about IntellisperError
     * (whose `message` is only the error CODE — the human text lives in `params.message`) nor own a
     * logger. Optional: when absent the engine falls back to `err.message`, preserving prior
     * behaviour for any other caller.
     */
    onError?: (err: unknown) => string
}

/**
 * Drive the loop from the given checkpoint until it completes, halts, errors, or PAUSES on an
 * extension action. Yields AgentEvents throughout. Returns (stops iterating) at a pause or terminal.
 */
export async function* driveEngine(cp: RunCheckpoint, deps: EngineDeps): AsyncGenerator<AgentEvent> {
    try {
        while (cp.steps < deps.maxSteps) {
            if (cp.totalTokens > deps.costCeiling) {
                await deps.finish(cp, 'halted', 'budget')
                yield { type: 'halted', reason: 'budget' }
                return
            }

            // 1) Drain any pending tool calls from the previous batch before a new model turn.
            if (cp.pendingCalls && cp.pendingCalls.length) {
                const drained = yield* drainPending(cp, deps)
                if (drained === 'paused') return
            }

            // 2) One model turn on the stall-selected tier.
            const tier = tierRouter.pickTier(cp, deps.reasoningAllowed)
            const turn = await deps.callModel({
                tier,
                loopState: cp.loopState,
                seedMessages: cp.loopState ? [] : deps.seedMessages,
                toolDefs: deps.toolDefs,
                toolResults: cp.gatheredResults,
                // The engine's own persisted step index. The AI-Gateway ledger uses it to build a
                // per-turn idempotency key that is STABLE across a resume — so replaying a run that
                // died mid-way re-emits the same keys and cannot double-bill the turns it already did.
                step: cp.steps,
            })
            cp.totalTokens += turn.billedTokens
            cp.steps++
            cp.loopState = turn.state
            cp.gatheredResults = undefined
            tierRouter.recordTurnOutcome(cp, tier, turn.toolCalls.length > 0 || !!turn.text.trim())

            if (turn.text) {
                cp.finalText += (cp.finalText ? '\n' : '') + turn.text
                yield { type: 'text', text: turn.text }
            }

            // 3) Final turn → complete. Only a turn that produced final text AND requested no tools
            //    completes; an EMPTY turn (no text, no tools) is a stall, so the loop continues and
            //    escalates the tier (bounded by maxSteps). Completing on "no tool calls" alone would
            //    end the run on the first stall instead of escalating.
            if (turn.isFinal) {
                await deps.finish(cp, 'completed', null)
                yield { type: 'done', usage: { totalTokens: cp.totalTokens }, steps: cp.steps }
                return
            }

            // A stall (no tool calls, no final text) → loop again on the escalated tier.
            if (turn.toolCalls.length === 0) {
                await deps.persist(cp)
                continue
            }

            // 4) Execute this turn's tool calls in order; extension tools pause.
            const paused = yield* runToolBatch(turn.toolCalls, cp, deps)
            if (paused) return
        }

        await deps.finish(cp, 'halted', 'max_steps')
        yield { type: 'halted', reason: 'max_steps' }
    }
    catch (err) {
        const message = deps.onError?.(err) ?? (err as Error)?.message ?? 'The agent hit an unexpected error.'
        await deps.finish(cp, 'failed', message)
        yield { type: 'error', message }
    }
}

/** Drain a persisted pending batch (resume path). Returns 'paused' if it re-pauses. */
async function* drainPending(cp: RunCheckpoint, deps: EngineDeps): AsyncGenerator<AgentEvent, 'paused' | 'drained'> {
    const results: ProviderToolResult[] = cp.gatheredResults ? [...cp.gatheredResults] : []
    const queue = [...(cp.pendingCalls ?? [])]
    while (queue.length) {
        const call = queue.shift()!
        const paused = yield* dispatchOne(call, queue, results, cp, deps)
        if (paused) return 'paused'
    }
    cp.gatheredResults = results
    cp.pendingCalls = undefined
    await deps.persist(cp)
    return 'drained'
}

/** Execute a fresh turn's tool calls. Returns true if it paused on an extension action. */
async function* runToolBatch(calls: ProviderToolCall[], cp: RunCheckpoint, deps: EngineDeps): AsyncGenerator<AgentEvent, boolean> {
    const results: ProviderToolResult[] = cp.gatheredResults ? [...cp.gatheredResults] : []
    for (let i = 0; i < calls.length; i++) {
        const rest = calls.slice(i + 1)
        const paused = yield* dispatchOne(calls[i], rest, results, cp, deps)
        if (paused) return true
    }
    cp.gatheredResults = results
    cp.pendingCalls = undefined
    await deps.persist(cp)
    return false
}

/**
 * Dispatch a single call. Server tools push a result and continue; extension tools persist the
 * remaining batch + gathered results onto the checkpoint, emit the pause event, and signal a pause.
 */
async function* dispatchOne(
    call: ProviderToolCall,
    rest: ProviderToolCall[],
    results: ProviderToolResult[],
    cp: RunCheckpoint,
    deps: EngineDeps,
): AsyncGenerator<AgentEvent, boolean> {
    const outcome = await deps.dispatchTool(call)
    if (outcome.kind === 'server') {
        yield { type: 'tool', tool: call.name, status: outcome.ok ? 'done' : 'error', label: deps.labelFor(call.name) }
        if (outcome.ok) {
            const obs = outcome.observation
            // Surface a gathered research source (progress), citations, and a ready-to-download file.
            if (outcome.researchSource) {
                yield { type: 'research_source', ...outcome.researchSource }
            }
            const cites = (obs as { citations?: unknown }).citations
            if (Array.isArray(cites) && cites.length) {
                const src = (obs as { source?: { url: string, title: string } }).source
                yield { type: 'citations', citations: cites.map(String), source: src }
            }
            const downloadUrl = (obs as { downloadUrl?: unknown }).downloadUrl
            if (typeof downloadUrl === 'string') {
                const name = (obs as { name?: unknown }).name
                yield { type: 'file_ready', name: typeof name === 'string' ? name : 'edited file', url: downloadUrl }
            }
        }
        results.push({ toolCallId: call.id, toolName: call.name, output: outcome.ok ? outcome.observation : { error: outcome.error } })
        return false
    }
    if (outcome.kind === 'await_expansion') {
        // Source budget reached: re-queue THIS call at the head so it re-runs after expansion, keep
        // gathered results, persist, and pause for the user's go-deeper / compile-now decision.
        cp.gatheredResults = results
        cp.pendingCalls = [call, ...rest]
        await deps.persist(cp)
        yield { type: 'awaiting_expansion', gathered: outcome.gathered, sourceCap: outcome.sourceCap, expandBy: outcome.expandBy, canExpand: outcome.canExpand }
        return true
    }
    // Extension tool → pause. Persist remaining batch + gathered results + the action↔call mapping.
    cp.gatheredResults = results
    cp.pendingCalls = rest
    cp.actionCallIds = { ...(cp.actionCallIds ?? {}), [outcome.actionId]: call.id }
    await deps.persist(cp)
    if (outcome.actionClass === 'consequential') {
        yield { type: 'awaiting_confirmation', actionId: outcome.actionId, tool: call.name, args: call.args, label: deps.labelFor(call.name), summary: deps.summaryFor(call) }
    }
    else {
        yield { type: 'action', actionId: outcome.actionId, tool: call.name, args: call.args, actionClass: outcome.actionClass, label: deps.labelFor(call.name) }
    }
    return true
}
