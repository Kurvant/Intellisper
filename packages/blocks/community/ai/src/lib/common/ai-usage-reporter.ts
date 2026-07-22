import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import type { ReportAiUsageRequest } from '@intelblocks/shared';

/**
 * AI Gateway — the AI block's usage reporter.
 *
 * Buffers the usage produced by one block step and posts it ONCE, on the engine's existing
 * authenticated channel (`POST {apiUrl}v1/ai-gateway/usage` with the engine token) — the same channel
 * the block already uses to fetch its provider config. No new transport, no new auth.
 *
 * The rules are the same everywhere in this system, because they are what make metering safe:
 *
 *   - `record()` is synchronous and buffers in memory. The flow step never waits on it.
 *   - `flush()` is awaited only AFTER the AI call has returned, and it swallows its own errors: a
 *     failed report degrades the LEDGER, never the customer's flow run.
 *   - The API re-derives the tenant from the engine JWT, so this payload cannot bill anyone else.
 */

const MAX_BUFFERED = 1_000;

export type BlockAiUsageReporter = {
    record: (call: ReportAiUsageRequest) => void;
    flush: () => Promise<void>;
};

export function createBlockAiUsageReporter(params: {
    apiUrl: string;
    engineToken: string;
}): BlockAiUsageReporter {
    let buffer: ReportAiUsageRequest[] = [];

    return {
        record(call: ReportAiUsageRequest): void {
            // Bounded: a runaway loop must not grow the sandbox's heap.
            if (buffer.length >= MAX_BUFFERED) {
                return;
            }
            buffer.push(call);
        },

        async flush(): Promise<void> {
            if (buffer.length === 0) {
                return;
            }
            const calls = buffer;
            buffer = [];
            try {
                await httpClient.sendRequest({
                    method: HttpMethod.POST,
                    url: `${params.apiUrl}v1/ai-gateway/usage`,
                    headers: { Authorization: `Bearer ${params.engineToken}` },
                    body: { calls },
                });
            } catch (err) {
                // NEVER rethrow. The customer's flow already succeeded; failing it now because our
                // telemetry could not be delivered would be strictly worse than losing the row.
                console.warn('[aiUsageReporter] failed to report AI usage; this spend will not appear in the ledger', err);
            }
        },
    };
}
