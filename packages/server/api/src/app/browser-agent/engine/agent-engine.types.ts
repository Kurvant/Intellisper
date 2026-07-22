import type { ProviderToolCall, ProviderToolResult, ToolLoopState } from '../model-provider/model-provider.types'

/**
 * Events the pure engine yields. The engine is transport-agnostic: it emits these; the controller
 * layer serialises them to SSE. The union is ADDITIVE-ONLY across protocol versions (never rename
 * or remove a variant) — the extension speaks this contract.
 */
export type AgentEvent =
    | { type: 'meta', conversationId: string, runId: string }
    | { type: 'text', text: string }
    | { type: 'tool', tool: string, status: 'running' | 'done' | 'error', label?: string }
    | { type: 'citations', citations: string[], source?: { url: string, title: string } }
    // A browser action the EXTENSION must execute, then POST an observation back. The stream ends
    // after this; the client resumes the run via /observation.
    | { type: 'action', actionId: string, tool: string, args: Record<string, unknown>, actionClass: 'safe' | 'reversible' | 'consequential', label: string }
    // A consequential action awaiting explicit user approval. Stream ends; resume via /approve|/reject.
    | { type: 'awaiting_confirmation', actionId: string, tool: string, args: Record<string, unknown>, label: string, summary: string }
    | { type: 'research_source', via: 'fetch' | 'tab', url: string, title: string, gathered: number, sourceCap: number }
    | { type: 'awaiting_expansion', gathered: number, sourceCap: number, expandBy: number, canExpand: boolean }
    | { type: 'close_tabs', tabIds: number[] }
    | { type: 'file_ready', name: string, url: string }
    | { type: 'done', usage: { totalTokens: number }, steps: number }
    | { type: 'halted', reason: string }
    | { type: 'budget_exceeded', scope: 'user' | 'platform', used: number, limit: number, resetsAt: string, upgradeUrl: string, message: string }
    | { type: 'entitlement_required', feature: string, requiredPlan: string, currentPlan: string, upgradeUrl: string, message: string }
    | { type: 'usage_limit_reached', metric: string, cap: number, plan: string, upgradeUrl: string, message: string }
    | { type: 'error', message: string }

/**
 * Persisted, resumable run state (stored in browser_agent_run.checkpoint as JSONB). NO critical
 * state lives in process memory — any replica resumes a run from this checkpoint, which is what
 * makes the action loop scale horizontally and survive MV3 worker eviction.
 */
export type RunCheckpoint = {
    /** Opaque provider tool-loop state (SDK messages) carried across turns. */
    loopState: ToolLoopState | null
    finalText: string
    totalTokens: number
    steps: number
    /** The page snapshot captured for this run (untrusted data), if page-aware. */
    page: unknown | null
    /** Tool calls from the latest model turn still needing execution/results. */
    pendingCalls?: ProviderToolCall[]
    /** Tool results gathered so far for the pending batch (server-side tools). */
    gatheredResults?: ProviderToolResult[]
    /** Maps a persisted action id → the originating model toolCallId (pairing bridge). */
    actionCallIds?: Record<string, string>
    /** Per-run research bookkeeping (source budget + gathered sources). Absent until research begins. */
    research?: ResearchState
    /**
     * Deterministic-replay state. Present ONLY on runs started by the routine replay driver (never on
     * a normal chat run). The pure model engine ignores this field entirely — replay is driven by the
     * runtime host's own loop (driveReplay/resumeReplay), which walks these steps WITHOUT a model turn
     * on the happy path (the model is invoked only to self-heal a locator miss).
     */
    replay?: ReplayCheckpoint
    /**
     * Model-tier escalation state (cost routing). The loop runs on the cheap `default` tier and
     * escalates only when a step STALLS (a turn with neither a tool call nor final text).
     */
    escalation?: {
        consecutiveStalls: number
        escalations: number
        reasoningEscalations: number
    }
    /** Routine-run history row id (thin history record the replay driver updates). Replay runs only. */
    routineRunId?: string
    /** Total step count of the replayed routine (surfaced on the history row). Replay runs only. */
    routineStepsTotal?: number
}

/** One resolved replay step carried on the checkpoint (params already substituted). */
export type ReplayCheckpointStep = {
    ordinal: number
    action: string
    locators: Record<string, unknown>
    args: Record<string, unknown>
    intent: string
    config?: Record<string, unknown>
}

/**
 * Deterministic-replay state on the checkpoint. Survives every pause/resume so any replica can drive
 * the next step from persisted state alone (replica-safe, MV3-eviction-safe). `cursor` is the index
 * of the NEXT step to execute; heal/retry counters are keyed by step ordinal.
 */
export type ReplayCheckpoint = {
    steps: ReplayCheckpointStep[]
    cursor: number
    /** Self-heal attempts consumed per step ordinal (bounded, ≤ MAX_HEAL_ATTEMPTS). */
    healAttempts: Record<number, number>
    /** Plain transient retries consumed per step ordinal (bounded, ≤ MAX_STEP_RETRIES). */
    stepRetries: Record<number, number>
    /** Records accumulated by `extract` steps (≤1000/step). */
    extracted: unknown[]
    /** interactive = side-panel replay; unattended = batch/schedule (consequential steps park). */
    mode: 'interactive' | 'unattended'
    /** The saved routine this run replays. */
    routineId: string
    /** Set when this replay is one row of a batch (parent advances on terminal). */
    batchJobId?: string
}

/** The stall-based tier decision inputs the engine needs from its host. */
export type EngineTierPolicy = {
    /** Whether this run may reach the reasoning (Opus) tier — Max/Enterprise only. */
    reasoningAllowed: boolean
}

/** A single gathered research source (compact — extracts feed synthesis). */
export type ResearchSource = {
    url: string
    title: string
    extract: string
    via: 'fetch' | 'tab'
}

/**
 * Per-run research state on the checkpoint. The source cap survives pauses/resumes and grows by
 * expandBy on each confirmed expansion, so the budget is stable and replica-safe.
 */
export type ResearchState = {
    gathered: ResearchSource[]
    sourceCap: number
    expansions: number
}
