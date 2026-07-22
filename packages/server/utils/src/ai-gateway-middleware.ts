import {
    AiKeyMode,
    AiModality,
    type AiFeature,
    extractProviderCostUsd,
    extractRequestId,
    normalizeUsage,
    type ReportAiUsageRequest,
    type SdkLanguageModelUsage,
} from '@intelblocks/shared'
import type { EmbeddingModelV3, LanguageModelV3 } from '@ai-sdk/provider'
import {
    type EmbeddingModelMiddleware,
    type LanguageModelMiddleware,
    wrapEmbeddingModel,
    wrapLanguageModel,
} from 'ai'

/**
 * AI Gateway — the interception layer.
 *
 * This is HOW we meter AI without a proxy. The original spec called for routing every call through a
 * self-hosted Portkey gateway; we do not, because that adds a network hop to every inference (latency
 * we were told not to add) and makes the gateway a single point of failure for ALL AI — if it is down,
 * the product is down. It buys nothing we cannot get for free: the provider ALREADY returns token
 * usage (and, for OpenRouter, its own USD cost) on the response we are ALREADY awaiting.
 *
 * So we wrap the model instead. Every plane in the system constructs its model through exactly one
 * factory function, and the AI SDK (`ai@6`) gives us `wrapLanguageModel` / `wrapEmbeddingModel` to
 * decorate it. The middleware reads an object that is already in memory and hands it to an async sink.
 *
 * LATENCY ADDED TO THE USER'S REQUEST: ZERO. The middleware performs no I/O, awaits nothing extra, and
 * does not touch the stream's timing — it observes the `finish` part as it flows past, unmodified.
 *
 * FAILURE ADDED TO THE USER'S REQUEST: ZERO. Every emit is wrapped: if metering throws, the AI call
 * still succeeds. Telemetry that can break the product it observes is worse than no telemetry.
 */

/** Everything the ledger needs that the model itself cannot know. Supplied by the call site. */
export type AiUsageContext = {
    platformId: string
    projectId?: string | null
    userId?: string | null
    feature: AiFeature
    /** runId / conversationId / flowRunId — the unit of work, so a single run can be costed end to end. */
    featureRef?: string | null
    keyMode: AiKeyMode
    /**
     * Stable prefix for the idempotency key. The middleware appends a monotonic call counter, so the
     * N-th model call of a given run is always the same key — which is what makes a RETRY of that run
     * a no-op in the ledger instead of a double charge. Every transport here is at-least-once.
     */
    idempotencyPrefix: string
}

/** Where a metered call is delivered. In-process in the API; over RPC from the worker/engine. */
export type AiUsageEmitter = (call: ReportAiUsageRequest) => void

/**
 * Wrap a language model so every generate/stream through it is metered.
 *
 * `provider`/`model` are taken from the wrapped model itself where possible, so a fallback or a tier
 * switch is attributed to the model that ACTUALLY ran, not the one we intended to run.
 */
export function meterLanguageModel(params: {
    model: LanguageModelV3
    context: AiUsageContext
    emit: AiUsageEmitter
    /** Overrides the model's self-reported id — used when the id we bill on differs (e.g. tier names). */
    modelId?: string
    onError?: (err: unknown) => void
}): LanguageModelV3 {
    const { model, context, emit, modelId, onError } = params

    // Each wrapped model gets its own counter, so keys are stable and unique WITHIN a run.
    let callSeq = 0

    const middleware: LanguageModelMiddleware = {
        specificationVersion: 'v3',

        async wrapGenerate({ doGenerate, model: m }) {
            const result = await doGenerate()
            // Metering happens AFTER the result is in hand and never delays returning it.
            safely(onError, () => {
                emit(buildCall({
                    context,
                    seq: ++callSeq,
                    provider: m.provider,
                    model: modelId ?? m.modelId,
                    modality: AiModality.TEXT,
                    usage: result.usage as unknown as SdkLanguageModelUsage,
                    providerMetadata: result.providerMetadata,
                    response: result.response,
                }))
            })
            return result
        },

        async wrapStream({ doStream, model: m }) {
            const { stream, ...rest } = await doStream()
            const seq = ++callSeq

            // Observe the stream as it flows to the user. We enqueue every chunk UNCHANGED and do our
            // work only on the terminal `finish` part, which is the one that carries usage +
            // providerMetadata. The user's tokens are not delayed by a single tick.
            const metered = stream.pipeThrough(
                new TransformStream({
                    transform(chunk, controller) {
                        controller.enqueue(chunk)
                        const part = chunk as {
                            type?: string
                            usage?: unknown
                            providerMetadata?: unknown
                            response?: unknown
                        }
                        if (part.type === 'finish') {
                            safely(onError, () => {
                                emit(buildCall({
                                    context,
                                    seq,
                                    provider: m.provider,
                                    model: modelId ?? m.modelId,
                                    modality: AiModality.TEXT,
                                    usage: part.usage as SdkLanguageModelUsage,
                                    providerMetadata: part.providerMetadata,
                                    response: rest.response,
                                }))
                            })
                        }
                    },
                }),
            )

            return { stream: metered, ...rest }
        },
    }

    return wrapLanguageModel({ model, middleware })
}

/**
 * Wrap an embedding model. Embeddings are cheap per call but run in bulk (memory indexing, RAG), so
 * they are a real line item that has been invisible until now.
 *
 * NOTE: `embedMany` auto-chunks large inputs into MULTIPLE doEmbed calls, so this fires once per
 * chunk. That is correct — each chunk is a real billable request — and the counter keeps their
 * idempotency keys distinct so they SUM rather than collide into one.
 */
export function meterEmbeddingModel(params: {
    model: EmbeddingModelV3
    context: AiUsageContext
    emit: AiUsageEmitter
    modelId?: string
    onError?: (err: unknown) => void
}): EmbeddingModelV3 {
    const { model, context, emit, modelId, onError } = params
    let callSeq = 0

    const middleware: EmbeddingModelMiddleware = {
        specificationVersion: 'v3',
        async wrapEmbed({ doEmbed, model: m }) {
            const result = await doEmbed()
            safely(onError, () => {
                // Embeddings bill on input tokens only — there is no output and no cache.
                const tokens = {
                    inputTokens: intOf(result.usage?.tokens),
                    outputTokens: 0,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    reasoningTokens: 0,
                }
                emit({
                    idempotencyKey: `${context.idempotencyPrefix}:e${++callSeq}`,
                    platformId: context.platformId,
                    projectId: context.projectId ?? null,
                    userId: context.userId ?? null,
                    feature: context.feature,
                    featureRef: context.featureRef ?? null,
                    provider: m.provider,
                    model: modelId ?? m.modelId,
                    modality: AiModality.EMBEDDING,
                    keyMode: context.keyMode,
                    tokens,
                    providerCostUsd: extractProviderCostUsd(result.providerMetadata),
                    requestId: null,
                    occurredAt: Date.now(),
                })
            })
            return result
        },
    }

    return wrapEmbeddingModel({ model, middleware })
}

function buildCall(params: {
    context: AiUsageContext
    seq: number
    provider: string
    model: string
    modality: AiModality
    usage: SdkLanguageModelUsage | undefined
    providerMetadata: unknown
    response: unknown
}): ReportAiUsageRequest {
    const { context, seq, provider, model, modality, usage, providerMetadata, response } = params
    return {
        // Stable per (run, call-index): a retried run re-emits the SAME keys, and the ledger's unique
        // index turns those into no-ops. This is what makes at-least-once delivery safe to bill on.
        idempotencyKey: `${context.idempotencyPrefix}:${seq}`,
        platformId: context.platformId,
        projectId: context.projectId ?? null,
        userId: context.userId ?? null,
        feature: context.feature,
        featureRef: context.featureRef ?? null,
        provider,
        model,
        modality,
        keyMode: context.keyMode,
        // Normalizes away the trap that Anthropic's input total INCLUDES its cache tokens while
        // OpenAI's does not — billing the raw total would double-charge every cached token.
        tokens: normalizeUsage(usage),
        // The provider's own USD figure when it gives one (OpenRouter does). It wins over our table:
        // the vendor's invoice is the fact; our price table is the approximation.
        providerCostUsd: extractProviderCostUsd(providerMetadata),
        requestId: extractRequestId(response),
        occurredAt: Date.now(),
    }
}

/**
 * Run a metering side-effect such that it can NEVER affect the AI call. If the ledger throws, the
 * user still gets their completion. This is the whole contract of the gateway in four lines.
 */
function safely(onError: ((err: unknown) => void) | undefined, fn: () => void): void {
    try {
        fn()
    }
    catch (err) {
        onError?.(err)
    }
}

function intOf(n: unknown): number {
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export const aiGatewayMiddleware = {
    meterLanguageModel,
    meterEmbeddingModel,
    AiKeyMode,
}
