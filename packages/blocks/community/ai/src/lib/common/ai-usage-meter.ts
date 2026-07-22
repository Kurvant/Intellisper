import {
    AiFeature,
    AiKeyMode,
    AiModality,
    extractProviderCostUsd,
    extractRequestId,
    normalizeUsage,
    type ReportAiUsageRequest,
    type SdkLanguageModelUsage,
} from '@intelblocks/shared';
import type { EmbeddingModelV3, LanguageModelV3 } from '@ai-sdk/provider';
import {
    type EmbeddingModel,
    type EmbeddingModelMiddleware,
    type LanguageModel,
    type LanguageModelMiddleware,
    wrapEmbeddingModel,
    wrapLanguageModel,
} from 'ai';

/**
 * AI Gateway — metering for AI blocks running inside the engine sandbox.
 *
 * This is the third and largest execution plane. A flow's AI steps call vendors DIRECTLY, using a
 * decrypted provider key the engine fetches over HTTP — so before this, every token a customer's flow
 * burned was real money to us that appeared in no cost record at all.
 *
 * Why a copy of the middleware lives here rather than being imported:
 *
 *   The interception logic itself is shared (`normalizeUsage` / `extractProviderCostUsd` come from
 *   @intelblocks/shared, so the token math and the provider-semantics normalization can never drift
 *   between planes). But the WRAPPER has to be local, because the wiring is different in each
 *   direction: `server/utils` is a server package the sandboxed block cannot import, and pushing an
 *   `ai` dependency down into `shared` would drag the entire AI SDK into the WEB bundle, which imports
 *   shared. Duplicating ~40 lines of plumbing is the cheaper trade than either of those.
 *
 * Latency added: zero. We read usage off a response we are already awaiting; there is no proxy and no
 * extra request. If metering throws, the block's AI call is unaffected.
 */

/** Where a metered call goes. The engine hands us a buffer that flushes over the worker RPC relay. */
export type BlockUsageEmitter = (call: ReportAiUsageRequest) => void;

export type BlockUsageContext = {
    platformId: string;
    projectId: string;
    /** The flow run — so a customer can be shown exactly what a given run cost. */
    runId: string;
    /** Distinguishes steps within one run, so their idempotency keys don't collide. */
    stepName: string;
};

/**
 * Wrap an AI block's language model so its usage lands in the ledger.
 *
 * `keyMode` is BYOK when the flow uses the customer's own connection (their vendor bill, not ours) and
 * MANAGED when it runs on the platform's key (our cost, their credits). Recording both, but tagging
 * them, is what keeps BYOK volume from being mistaken for OUR cost of goods.
 */
export function meterBlockModel(params: {
    model: LanguageModel;
    context: BlockUsageContext;
    emit: BlockUsageEmitter;
    provider: string;
    modelId: string;
    keyMode: AiKeyMode;
    onError?: (err: unknown) => void;
}): LanguageModel {
    const { model, context, emit, provider, modelId, keyMode, onError } = params;
    let seq = 0;

    const middleware: LanguageModelMiddleware = {
        specificationVersion: 'v3',

        async wrapGenerate({ doGenerate }) {
            const result = await doGenerate();
            safely(onError, () => {
                emit(build({
                    context, seq: ++seq, provider, modelId, keyMode,
                    modality: AiModality.TEXT,
                    usage: result.usage as unknown as SdkLanguageModelUsage,
                    providerMetadata: result.providerMetadata,
                    response: result.response,
                }));
            });
            return result;
        },

        async wrapStream({ doStream }) {
            const { stream, ...rest } = await doStream();
            const mySeq = ++seq;
            // Observe the stream as it flows; enqueue every chunk UNCHANGED. The terminal `finish`
            // part is the one carrying usage + providerMetadata. Nothing is delayed by a single tick.
            const metered = stream.pipeThrough(
                new TransformStream({
                    transform(chunk, controller) {
                        controller.enqueue(chunk);
                        const part = chunk as { type?: string; usage?: unknown; providerMetadata?: unknown };
                        if (part.type === 'finish') {
                            safely(onError, () => {
                                emit(build({
                                    context, seq: mySeq, provider, modelId, keyMode,
                                    modality: AiModality.TEXT,
                                    usage: part.usage as SdkLanguageModelUsage,
                                    providerMetadata: part.providerMetadata,
                                    response: rest.response,
                                }));
                            });
                        }
                    },
                }),
            );
            return { stream: metered, ...rest };
        },
    };

    return wrapLanguageModel({ model: model as LanguageModelV3, middleware }) as LanguageModel;
}

/** Wrap an embedding model (the RAG tool embeds in bulk — a real, previously invisible line item). */
export function meterBlockEmbeddingModel(params: {
    model: EmbeddingModel;
    context: BlockUsageContext;
    emit: BlockUsageEmitter;
    provider: string;
    modelId: string;
    keyMode: AiKeyMode;
    onError?: (err: unknown) => void;
}): EmbeddingModel {
    const { model, context, emit, provider, modelId, keyMode, onError } = params;
    let seq = 0;

    const middleware: EmbeddingModelMiddleware = {
        specificationVersion: 'v3',
        async wrapEmbed({ doEmbed }) {
            const result = await doEmbed();
            safely(onError, () => {
                emit({
                    // embedMany fans out to N doEmbed calls for large inputs; the counter keeps their
                    // keys distinct so they SUM rather than collapsing into a single row.
                    idempotencyKey: `blk:${context.runId}:${context.stepName}:e${++seq}`,
                    platformId: context.platformId,
                    projectId: context.projectId,
                    userId: null,
                    feature: AiFeature.FLOW_BLOCK,
                    featureRef: context.runId,
                    provider,
                    model: modelId,
                    modality: AiModality.EMBEDDING,
                    keyMode,
                    tokens: {
                        inputTokens: intOf(result.usage?.tokens),
                        outputTokens: 0,
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                        reasoningTokens: 0,
                    },
                    providerCostUsd: extractProviderCostUsd(result.providerMetadata),
                    requestId: null,
                    occurredAt: Date.now(),
                });
            });
            return result;
        },
    };

    return wrapEmbeddingModel({ model: model as EmbeddingModelV3, middleware }) as EmbeddingModel;
}

function build(p: {
    context: BlockUsageContext;
    seq: number;
    provider: string;
    modelId: string;
    keyMode: AiKeyMode;
    modality: AiModality;
    usage: SdkLanguageModelUsage | undefined;
    providerMetadata: unknown;
    response: unknown;
}): ReportAiUsageRequest {
    return {
        // Stable per (run, step, call-index): a RETRIED flow run re-emits the same keys, and the
        // ledger's unique index turns those into no-ops. The job queue is at-least-once, so a retry is
        // a matter of when, not if — and a double-charged customer is the exact failure we refuse.
        idempotencyKey: `blk:${p.context.runId}:${p.context.stepName}:${p.seq}`,
        platformId: p.context.platformId,
        projectId: p.context.projectId,
        userId: null,
        feature: AiFeature.FLOW_BLOCK,
        featureRef: p.context.runId,
        provider: p.provider,
        model: p.modelId,
        modality: p.modality,
        keyMode: p.keyMode,
        // Normalizes the trap that Anthropic's input total INCLUDES its cache tokens while OpenAI's
        // does not — billing the raw total would double-charge every cached token.
        tokens: normalizeUsage(p.usage),
        // OpenRouter reports its own USD cost; it wins over any estimate we could make.
        providerCostUsd: extractProviderCostUsd(p.providerMetadata),
        requestId: extractRequestId(p.response),
        occurredAt: Date.now(),
    };
}

/** Metering must NEVER be able to fail the AI call it observes. */
function safely(onError: ((err: unknown) => void) | undefined, fn: () => void): void {
    try {
        fn();
    } catch (err) {
        onError?.(err);
    }
}

function intOf(n: unknown): number {
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
