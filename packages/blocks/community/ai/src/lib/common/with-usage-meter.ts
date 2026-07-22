import type { BlockUsageEmitter } from './ai-usage-meter';
import { createBlockAiUsageReporter } from './ai-usage-reporter';

/**
 * AI Gateway — the one helper every AI action uses to meter itself.
 *
 * Each action wraps its body in `withAiUsageMeter(context, stepName, fn)`. That:
 *   1. creates a per-step buffer,
 *   2. hands the action a `usageMeter` to pass into createAIModel/createEmbeddingModel, and
 *   3. FLUSHES once, in a `finally`, after the action has produced its result.
 *
 * The flush is in a `finally` deliberately. A step that THREW still burned the tokens it spent before
 * throwing — and failed AI steps are often the expensive ones (a long agent loop that hit an error at
 * the end). Reporting only on success would leave a silent hole in the cost record for exactly the
 * runs we most need to see.
 *
 * The flush is awaited, but it is off the customer's critical path: the AI call has already returned
 * by then, and a failure inside it is swallowed. Metering can never fail a flow run.
 */

/** The slice of a block's execution context this needs. Structural, so any action's context fits. */
type MeterableContext = {
    server: { token: string; apiUrl: string };
    project: { id: string };
    run: { id: string };
};

export type AiUsageMeterHandle = {
    /** Pass straight into createAIModel({ usageMeter }). */
    usageMeter: { stepName: string; emit: BlockUsageEmitter };
    /** Pass into createEmbeddingModel({ usageMeter }) — it also needs the run/project ids. */
    embeddingUsageMeter: { stepName: string; projectId: string; runId: string; emit: BlockUsageEmitter };
};

export async function withAiUsageMeter<T>(
    context: MeterableContext,
    stepName: string,
    fn: (handle: AiUsageMeterHandle) => Promise<T>,
): Promise<T> {
    const reporter = createBlockAiUsageReporter({
        apiUrl: context.server.apiUrl,
        engineToken: context.server.token,
    });
    const emit: BlockUsageEmitter = (call) => reporter.record(call);

    const handle: AiUsageMeterHandle = {
        usageMeter: { stepName, emit },
        embeddingUsageMeter: {
            stepName,
            projectId: context.project.id,
            runId: context.run.id,
            emit,
        },
    };

    try {
        return await fn(handle);
    } finally {
        // Report on EVERY path — success and failure alike. Spend already incurred is spend already
        // incurred; whether the step went on to succeed is irrelevant to what it cost us.
        await reporter.flush();
    }
}
