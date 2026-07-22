import { AiFeature } from '@intelblocks/shared'
import { ModelTier } from './model-provider.config'

/** A message part for multimodal turns (text or image). */
export type ProviderContentPart =
    | { type: 'text', text: string }
    | { type: 'image', image: string, mediaType?: string }

/** A provider-agnostic chat message. Content is text or an array of multimodal parts. */
export type ProviderMessage = {
    role: 'system' | 'user' | 'assistant'
    content: string | ProviderContentPart[]
}

/** A model-facing tool definition (schema only — tools execute in the agent loop, not the SDK). */
export type ProviderToolDef = {
    name: string
    description: string
    parameters: Record<string, unknown>
}

/** A tool call the model requested this turn. `id` is the model's tool_use id (pairing key). */
export type ProviderToolCall = {
    id: string
    name: string
    args: Record<string, unknown>
}

/** A tool result fed back on the next turn. `toolCallId` MUST match the originating call id. */
export type ProviderToolResult = {
    toolCallId: string
    toolName: string
    output: unknown
}

/**
 * OPAQUE carried loop state — the SDK's response messages, verbatim. The engine passes this back
 * across turns without inspecting it; hand-rebuilding assistant/tool messages breaks the
 * provider's tool_use/tool_result pairing, so it stays a black box outside the facade.
 */
export type ToolLoopState = { __messages: unknown[] }

/**
 * Cost-faithful usage. `billedTokens` = uncachedInput + cachedInput×0.1 + output — the figure that
 * accrues to a run's tokenCost, so re-sent cached context is not over-counted.
 */
export type ProviderUsage = {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cachedInputTokens: number
    billedTokens: number
}

/** Result of exactly ONE model turn. The engine owns the loop; the facade never loops. */
export type CallWithToolsResult = {
    text: string
    toolCalls: ProviderToolCall[]
    isFinal: boolean
    usage: ProviderUsage
    provider: string
    model: string
    state: ToolLoopState
}

export type ChatOptions = {
    tier: ModelTier
    system: string
    messages: ProviderMessage[]
    maxTokens?: number
    temperature?: number
}

export type CallWithToolsOptions = {
    tier: ModelTier
    system: string
    messages: ProviderMessage[]
    tools: ProviderToolDef[]
    priorState?: ToolLoopState
    toolResults?: ProviderToolResult[]
    maxTokens?: number
}

/**
 * Ledger attribution for the AI Gateway. Optional: when absent the model still runs, it is simply not
 * attributed to a run (the platform-level cost is still captured). Supplying it is what lets us answer
 * "what did THIS run cost us", which is the question the OpenRouter key ledger structurally cannot
 * answer — it has exactly one bucket per platform.
 *
 * `idempotencyPrefix` MUST be stable for a given unit of work: the middleware appends a call counter,
 * so replaying/retrying that work re-emits the same keys and the ledger's unique index turns the
 * duplicates into no-ops instead of double-charging.
 */
export type AgentLedgerContext = {
    projectId?: string | null
    userId?: string | null
    /** browser_agent for user-facing turns; platform for internal work (distillation, grammar). */
    feature: AiFeature
    /** The run/conversation this spend belongs to. */
    featureRef?: string | null
    idempotencyPrefix: string
}
