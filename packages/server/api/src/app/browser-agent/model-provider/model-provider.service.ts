import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { meterEmbeddingModel, meterLanguageModel } from '@intelblocks/server-utils'
import { AiKeyMode, ErrorCode, IntellisperError, normalizeUsage, type SdkLanguageModelUsage } from '@intelblocks/shared'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
    generateText,
    jsonSchema,
    type LanguageModel,
    type ModelMessage,
    tool,
    type ToolSet,
} from 'ai'
import { FastifyBaseLogger } from 'fastify'
import { aiUsageSink } from '../../ai-gateway/ai-usage-sink'
import { platformAiCreditsService } from '../../enterprise/platform/platform-plan/platform-ai-credits.service'
import { browserAgentKeyResolver, type ResolvedAgentKey } from './model-key-resolver'
import { browserAgentModelConfig, type ModelTier, type TierModel, toOpenRouterModelId } from './model-provider.config'
import type {
    AgentLedgerContext,
    CallWithToolsOptions,
    CallWithToolsResult,
    ProviderContentPart,
    ProviderMessage,
    ProviderToolCall,
    ProviderUsage,
} from './model-provider.types'

/**
 * Browser-agent model-provider facade over the Vercel AI SDK. The SDK never leaks past this file.
 * The engine owns the agent loop; `callWithTools` performs EXACTLY ONE model turn and carries the
 * loop state (the SDK's response messages) opaquely across turns so tool_use/tool_result pairing
 * stays intact across providers.
 *
 * Cost controls live here: Anthropic prompt caching (an ephemeral breakpoint on the last message
 * each call, never persisted into carried history), transparent OpenAI fallback before the first
 * token, and cost-faithful `billedTokens` metering (uncachedInput + cachedInput×0.1 + output).
 */
/** A cache READ is the cheap one — ~0.1x the input rate. */
const CACHE_READ_WEIGHT = 0.1
/**
 * A cache WRITE is a PREMIUM (~1.25x input on Anthropic), not a discount. Weighting it like a read —
 * as the pre-gateway formula effectively did — under-counts the cost of an agent that writes a cache
 * breakpoint on every single turn, which is exactly what this agent does.
 */
const CACHE_WRITE_WEIGHT = 1.25
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 400

/**
 * Build the browser-agent model-provider facade. `platformId` (optional) unifies the agent's AI
 * spend with the platform credit pool: when the platform has a managed provider key, inference is
 * routed through it (spend debits the shared `includedAiCredits` allowance once, metered by
 * OpenRouter). When absent — no platformId, managed AI disabled, or CE/self-host — the facade uses
 * the `BROWSER_AGENT_*` env keys exactly as before. Tiering, prompt-caching, and billedTokens are
 * identical in both modes.
 */
export const browserAgentModelProvider = (log: FastifyBaseLogger, platformId?: string, ledger?: AgentLedgerContext) => ({
    async callWithTools(options: CallWithToolsOptions): Promise<CallWithToolsResult> {
        // Resolve the key mode ONCE per turn (cached per-platform) so the fallback/retry loop below
        // reuses it without re-hitting the provider stack.
        const resolved = await browserAgentKeyResolver(log).resolve(platformId)
        return withFallback(log, options.tier, async (tierModel) => {
            const model = meter(buildModel(tierModel, resolved), tierModel, resolved, log, platformId, ledger)
            const messages = buildMessages(options)
            const tools = buildToolSet(options.tools)
            const isAnthropic = tierModel.provider === 'anthropic'

            try {
                const result = await generateText({
                    model,
                    system: options.system,
                    messages: isAnthropic ? withAnthropicCacheBreakpoint(messages) : messages,
                    tools,
                    maxOutputTokens: options.maxTokens,
                    maxRetries: 0, // retry/fallback handled by withFallback
                    // Anthropic prompt-caching breakpoint. In MANAGED mode this is routed through the
                    // OpenRouter provider, which honours `anthropic.cacheControl` (its getCacheControl
                    // reads the anthropic convention) AND enables usage accounting so cachedTokens/cost
                    // flow back for billedTokens — so caching + accounting are preserved either way.
                    ...(isAnthropic
                        ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } }, ...(resolved.mode === 'managed' ? { openrouter: { usage: { include: true } } } : {}) } }
                        : resolved.mode === 'managed'
                            ? { providerOptions: { openrouter: { usage: { include: true } } } }
                            : {}),
                })

                const toolCalls: ProviderToolCall[] = result.toolCalls.map((c) => ({
                    id: c.toolCallId,
                    name: c.toolName,
                    args: (c.input ?? {}) as Record<string, unknown>,
                }))

                const text = result.text ?? ''
                return {
                    text,
                    toolCalls,
                    // Final iff the model produced text and requested no tools. An EMPTY turn (no text,
                    // no tools) is NOT final — it's a stall the engine escalates from, not a completion.
                    isFinal: toolCalls.length === 0 && text.trim().length > 0,
                    usage: mapUsage(result.usage),
                    provider: tierModel.provider,
                    model: tierModel.model,
                    // Carried opaquely — the next turn feeds this back untouched.
                    state: { __messages: result.response.messages as unknown[] },
                }
            }
            catch (err) {
                // In MANAGED mode, an exhausted credit pool surfaces as an OpenRouter 402 / insufficient
                // credits. Translate it to a clean AI_CREDIT_LIMIT_EXCEEDED so callers (the engine) see
                // a typed, non-retryable signal instead of a raw provider error. Rethrow anything else
                // for withFallback/withRetry to handle. Env mode never hits this branch meaningfully.
                if (resolved.mode === 'managed' && isCreditExhaustionError(err)) {
                    throw await creditLimitError(log, platformId, err)
                }
                throw err
            }
        })
    },

    async embed(text: string): Promise<number[]> {
        // Embeddings use OpenAI directly; kept minimal (memory service is the primary consumer).
        const key = browserAgentModelConfig.openaiApiKey()
        if (!key) {
            throw new IntellisperError({ code: ErrorCode.VALIDATION, params: { message: 'Browser-agent OpenAI key not configured for embeddings' } })
        }
        const openai = createOpenAI({ apiKey: key })
        const { embedMany } = await import('ai')
        const embeddingModel = openai.textEmbeddingModel(browserAgentModelConfig.embeddingModel())
        // Meter embeddings too. They are cheap per call but run in BULK (memory indexing, recall), so
        // they are a real line item — and they were previously invisible: an env key, no accounting.
        const metered = platformId !== undefined && ledger !== undefined
            ? meterEmbeddingModel({
                model: embeddingModel as never,
                context: { platformId, projectId: ledger.projectId, userId: ledger.userId, feature: ledger.feature, featureRef: ledger.featureRef, keyMode: AiKeyMode.DIRECT, idempotencyPrefix: ledger.idempotencyPrefix },
                emit: (call) => aiUsageSink(log).record(call),
                onError: (err) => log.warn({ err }, '[browserAgentModelProvider] embedding meter failed (isolated)'),
            })
            : embeddingModel
        const { embeddings } = await embedMany({ model: metered as never, values: [text] })
        return embeddings[0]
    },

    getHealth(): { ready: boolean, tiers: Record<string, boolean> } {
        const hasAnthropic = !!browserAgentModelConfig.anthropicApiKey()
        const hasOpenai = !!browserAgentModelConfig.openaiApiKey()
        return {
            ready: hasAnthropic,
            tiers: {
                default: hasAnthropic,
                escalation: hasAnthropic,
                reasoning: hasAnthropic,
                fallback: hasOpenai,
                distill: hasAnthropic,
            },
        }
    },
})

function buildModel(tierModel: TierModel, resolved: ResolvedAgentKey): LanguageModel {
    // MANAGED: route through the platform's OpenRouter key so spend debits the shared credit pool.
    // OpenRouter is OpenAI-compatible and provider-namespaces model ids (`anthropic/…`, `openai/…`).
    // It honours the anthropic cacheControl breakpoint and returns cachedTokens/cost — so caching and
    // billedTokens are preserved. One key powers all tiers (Haiku/Sonnet/Opus/fallback).
    if (resolved.mode === 'managed') {
        const openrouter = createOpenRouter({ apiKey: resolved.apiKey, baseURL: resolved.baseURL })
        return openrouter(toOpenRouterModelId(tierModel))
    }
    // ENV: native SDK path, unchanged — the documented CE/self-hosted fallback.
    if (tierModel.provider === 'anthropic') {
        const key = browserAgentModelConfig.anthropicApiKey()
        if (!key) throw new IntellisperError({ code: ErrorCode.VALIDATION, params: { message: 'Browser-agent Anthropic key not configured' } })
        return createAnthropic({ apiKey: key })(tierModel.model)
    }
    const key = browserAgentModelConfig.openaiApiKey()
    if (!key) throw new IntellisperError({ code: ErrorCode.VALIDATION, params: { message: 'Browser-agent OpenAI key not configured' } })
    return createOpenAI({ apiKey: key })(tierModel.model)
}

/**
 * AI Gateway — meter this model turn.
 *
 * Wraps the model so the usage the provider ALREADY returns is captured and handed to the async
 * ledger sink. No proxy, no extra request, no added latency: we read an object that is in memory on a
 * response we are already awaiting. If metering throws, the model call is unaffected.
 *
 * The metered id is the TIER model (`tierModel.model`), not OpenRouter's namespaced id, so a call is
 * attributed to the model that actually ran even when it was routed through the managed key — and a
 * fallback from Haiku to GPT-4o is costed as GPT-4o, which is what we actually paid for.
 */
function meter(
    model: LanguageModel,
    tierModel: TierModel,
    resolved: ResolvedAgentKey,
    log: FastifyBaseLogger,
    platformId: string | undefined,
    ledger: AgentLedgerContext | undefined,
): LanguageModel {
    // No platform = no tenant to attribute the spend to (CE/self-host or an unscoped internal call).
    // Nothing to meter; the model is returned untouched.
    if (platformId === undefined || ledger === undefined) {
        return model
    }
    return meterLanguageModel({
        model: model as LanguageModelV3,
        modelId: tierModel.model,
        context: {
            platformId,
            projectId: ledger.projectId,
            userId: ledger.userId,
            feature: ledger.feature,
            featureRef: ledger.featureRef,
            // MANAGED = routed through the platform's OpenRouter key, so this already debited the
            // customer's credit pool. DIRECT = one of our own env keys — our card, and until this
            // gateway existed, entirely invisible spend.
            keyMode: resolved.mode === 'managed' ? AiKeyMode.MANAGED : AiKeyMode.DIRECT,
            idempotencyPrefix: ledger.idempotencyPrefix,
        },
        emit: (call) => aiUsageSink(log).record(call),
        onError: (err) => log.warn({ err }, '[browserAgentModelProvider] usage meter failed (isolated — the AI call was unaffected)'),
    }) as LanguageModel
}

/**
 * Detect an OpenRouter credit-exhaustion error. OpenRouter returns HTTP 402 with an "insufficient
 * credits"/quota message when the managed key's spend limit is reached. We match on the status and
 * the message so a wording change on either doesn't slip an exhaustion through as a generic error.
 */
export function isCreditExhaustionError(err: unknown): boolean {
    const status = (err as { statusCode?: number, status?: number })?.statusCode ?? (err as { status?: number })?.status
    if (status === 402) return true
    const msg = String((err as Error)?.message ?? err).toLowerCase()
    return /402|insufficient.?credit|quota.?exceeded|payment.?required|credit.?limit|negative.?credit/.test(msg)
}

/**
 * Build a typed AI_CREDIT_LIMIT_EXCEEDED error carrying the current usage/limit for the platform.
 * The usage/limit read is best-effort (it must not mask the original exhaustion) — on any failure we
 * emit zeros, which still yields the correct 402 signal to the caller.
 */
async function creditLimitError(log: FastifyBaseLogger, platformId: string | undefined, _cause: unknown): Promise<IntellisperError> {
    let usage = 0
    let limit = 0
    try {
        if (platformId) {
            const credits = await platformAiCreditsService(log).getUsage(platformId)
            usage = credits.usage
            limit = credits.limit
        }
    }
    catch {
        // best-effort — keep zeros
    }
    return new IntellisperError({ code: ErrorCode.AI_CREDIT_LIMIT_EXCEEDED, params: { usage, limit } })
}

function buildMessages(options: CallWithToolsOptions): ModelMessage[] {
    // On a continued turn we replay the carried SDK messages, then append the new tool results as a
    // `tool` message so each result pairs to its originating tool_use.
    if (options.priorState) {
        const carried = options.priorState.__messages as ModelMessage[]
        const resultParts = (options.toolResults ?? []).map((r) => ({
            type: 'tool-result' as const,
            toolCallId: r.toolCallId,
            toolName: r.toolName,
            output: { type: 'json' as const, value: r.output as never },
        }))
        if (resultParts.length === 0) return carried
        return [...carried, { role: 'tool', content: resultParts }]
    }
    return options.messages.map(toModelMessage)
}

function toModelMessage(m: ProviderMessage): ModelMessage {
    if (typeof m.content === 'string') {
        return { role: m.role, content: m.content } as ModelMessage
    }
    const parts = m.content.map(toModelPart)
    return { role: m.role, content: parts } as ModelMessage
}

function toModelPart(p: ProviderContentPart) {
    if (p.type === 'text') return { type: 'text' as const, text: p.text }
    return { type: 'image' as const, image: p.image, mediaType: p.mediaType }
}

function buildToolSet(tools: CallWithToolsOptions['tools']): ToolSet {
    const set: ToolSet = {}
    for (const t of tools) {
        // Schema-only tools: NO execute — the engine runs them, not the SDK.
        set[t.name] = tool({
            description: t.description,
            inputSchema: jsonSchema(t.parameters as never),
        })
    }
    return set
}

/**
 * Clone ONLY the last message and stamp an ephemeral cache breakpoint on it, so the whole prefix
 * (tools → system → prior messages) is cached. Re-derived every call; never persisted into carried
 * history (a stale mid-history breakpoint would cap the cached prefix).
 */
function withAnthropicCacheBreakpoint(messages: ModelMessage[]): ModelMessage[] {
    if (messages.length === 0) return messages
    const head = messages.slice(0, -1)
    const last = messages[messages.length - 1]
    const stamped = {
        ...last,
        providerOptions: { ...(last as { providerOptions?: unknown }).providerOptions as object, anthropic: { cacheControl: { type: 'ephemeral' } } },
    } as ModelMessage
    return [...head, stamped]
}

/**
 * Exported for unit testing the cost-faithful billed-token formula.
 *
 * Reads the SDK's `inputTokenDetails` rather than the deprecated flat `cachedInputTokens`. That is not
 * cosmetic: the deprecated field cannot distinguish a cache READ (cheap, 0.1x) from a cache WRITE
 * (a 1.25x PREMIUM on Anthropic) — so the old formula quietly under-counted every turn of an agent
 * that writes a cache breakpoint on every turn. Cache writes are now billed at their true premium.
 *
 * `normalizeUsage` (shared) does the provider-semantics normalization, so `input` here is always FRESH
 * input, never a total that secretly includes the cache.
 */
export function mapUsage(usage: SdkLanguageModelUsage | undefined): ProviderUsage {
    const t = normalizeUsage(usage)
    const promptTokens = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens
    const billedTokens = Math.round(
        t.inputTokens
        + t.cacheReadTokens * CACHE_READ_WEIGHT
        + t.cacheWriteTokens * CACHE_WRITE_WEIGHT
        + t.outputTokens,
    )
    return {
        promptTokens,
        completionTokens: t.outputTokens,
        totalTokens: promptTokens + t.outputTokens,
        cachedInputTokens: t.cacheReadTokens,
        billedTokens,
    }
}

/**
 * Retry transient errors on the SAME tier with exponential backoff; on exhaustion (or a
 * non-transient error) route ONCE to the fallback tier — unless already on fallback. Keeps the
 * agent loop resilient to a single-vendor hiccup without silently degrading every call.
 */
async function withFallback<T>(log: FastifyBaseLogger, tier: ModelTier, fn: (m: TierModel) => Promise<T>): Promise<T> {
    const primary = browserAgentModelConfig.tierModel(tier)
    try {
        return await withRetry(() => fn(primary))
    }
    catch (err) {
        // Credit exhaustion is TERMINAL — the managed key funds every tier, so the fallback tier would
        // hit the same exhausted pool. Surface it immediately; never burn a fallback call on it.
        if (isCreditLimitExceeded(err)) {
            throw err
        }
        const fallback = browserAgentModelConfig.tierModel('fallback')
        const sameAsPrimary = fallback.provider === primary.provider && fallback.model === primary.model
        if (tier === 'fallback' || sameAsPrimary || !browserAgentModelConfig.openaiApiKey()) {
            throw err
        }
        log.warn({ err: (err as Error).message, tier }, '[browserAgentModelProvider] primary failed; routing to fallback tier')
        return withRetry(() => fn(fallback))
    }
}

/** True iff the error is the typed AI_CREDIT_LIMIT_EXCEEDED (terminal — no retry, no fallback). */
function isCreditLimitExceeded(err: unknown): boolean {
    return err instanceof IntellisperError && err.error?.code === ErrorCode.AI_CREDIT_LIMIT_EXCEEDED
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn()
        }
        catch (err) {
            lastErr = err
            if (!isTransient(err) || attempt === MAX_RETRIES) break
            await sleep(RETRY_BACKOFF_MS * 2 ** attempt)
        }
    }
    throw lastErr
}

function isTransient(err: unknown): boolean {
    // Credit exhaustion is terminal — never retry it (the pool won't refill mid-loop).
    if (isCreditLimitExceeded(err)) return false
    const msg = String((err as Error)?.message ?? err).toLowerCase()
    if (msg.includes('aborted')) return false
    return /429|rate.?limit|overloaded|timeout|econnreset|5\d\d|network/.test(msg)
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
