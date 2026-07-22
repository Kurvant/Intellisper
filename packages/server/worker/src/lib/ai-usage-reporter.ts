import { type ReportAiUsageRequest, type WorkerToApiContract } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'

/**
 * AI Gateway — the worker's usage reporter.
 *
 * The worker runs Studio chat (and relays the engine's AI blocks), but the ledger lives in the API. So
 * usage has to cross a process boundary. It rides the EXISTING typed Socket.IO RPC contract
 * (`WorkerToApiContract.reportAiUsage`) — no new HTTP route, no new auth, no new transport.
 *
 * The rules are the same as the API-side sink, for the same reason: metering must never be able to
 * slow down or break the work it observes.
 *
 *   - `record()` is synchronous and buffers in memory. Nothing is awaited on the user's path.
 *   - Batched: one RPC per flush, not one per model call. A chat turn that makes 10 model calls costs
 *     one round-trip, not ten.
 *   - `flush()` is fire-and-forget and swallows its own errors. A failed report degrades the LEDGER,
 *     never the chat turn — the user has already been served by the time we get here.
 *   - Bounded, so a wedged API cannot grow the worker's heap without limit.
 */

const MAX_BUFFERED = 5_000

export type AiUsageReporter = {
    record: (call: ReportAiUsageRequest) => void
    flush: () => Promise<void>
}

export function createAiUsageReporter(
    apiClient: Pick<WorkerToApiContract, 'reportAiUsage'>,
    log: FastifyBaseLogger,
): AiUsageReporter {
    let buffer: ReportAiUsageRequest[] = []
    let dropped = 0

    return {
        record(call: ReportAiUsageRequest): void {
            if (buffer.length >= MAX_BUFFERED) {
                dropped++
                if (dropped % 500 === 1) {
                    log.error({ dropped }, '[aiUsageReporter] buffer full — dropping AI usage; spend is being under-reported')
                }
                return
            }
            buffer.push(call)
        },

        /**
         * Send whatever has accumulated. Called AFTER the response has already been streamed to the
         * user, so even the round-trip is off the critical path.
         *
         * On failure the rows are DROPPED, not requeued: the worker is per-job and about to exit, so
         * there is no later flush to retry into. We log loudly instead — an under-reported cost must
         * be visible, never silent.
         */
        async flush(): Promise<void> {
            if (buffer.length === 0) return
            const batch = buffer
            buffer = []
            try {
                await apiClient.reportAiUsage({ calls: batch })
            }
            catch (err) {
                log.error({ err, lost: batch.length }, '[aiUsageReporter] failed to report AI usage — this spend will NOT appear in the ledger')
            }
        },
    }
}
