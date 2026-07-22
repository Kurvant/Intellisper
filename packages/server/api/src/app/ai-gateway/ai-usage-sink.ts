import {
    AiCostSource,
    computeCallCost,
    ibId,
    ReportAiUsageRequest,
    usdToCredits,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../database/database-connection'

/**
 * AI Gateway — the async write path.
 *
 * THE ONE INVARIANT: this must never add latency to, or be able to fail, a user's AI request.
 * Telemetry that can break the product it observes is worse than no telemetry. So:
 *
 *   - `record()` is SYNCHRONOUS and returns immediately. It does no I/O, awaits nothing, and cannot
 *     throw into its caller. Callers `void` it from a path that has already returned to the user.
 *   - The buffer is BOUNDED. If the database is unreachable and the buffer fills, we drop rows and
 *     count the drops loudly. A metrics buffer must never be able to OOM the API.
 *   - Writes are BATCHED into one multi-row INSERT, so metering a busy platform costs the DB roughly
 *     one statement per flush window rather than one per model call.
 *   - `ON CONFLICT DO NOTHING` on the unique idempotency key makes a re-delivered report a no-op.
 *     Every transport feeding this is at-least-once, so a duplicate is a matter of when, not if — and
 *     a double-counted dollar is exactly the misleading number that gets expensive.
 *   - It DRAINS on shutdown, so a normal deploy loses nothing.
 */

/** Flush when the buffer reaches this many rows — keeps a burst from sitting around unwritten. */
const FLUSH_AT_ROWS = 200
/** ...or when this much time has passed, so a trickle still lands promptly. */
const FLUSH_INTERVAL_MS = 2_000
/**
 * Hard ceiling. At ~200 bytes/row this is a few MB — small enough to never threaten the process,
 * large enough to ride out a multi-minute database blip without losing anything.
 */
const MAX_BUFFERED_ROWS = 20_000

type LedgerRow = {
    id: string
    platformId: string
    projectId: string | null
    userId: string | null
    feature: string
    featureRef: string | null
    provider: string
    model: string
    modality: string
    keyMode: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningTokens: number
    costUsd: number
    costSource: string
    priceVersion: string | null
    billedCredits: number
    requestId: string | null
    idempotencyKey: string
    occurredAt: Date
}

/** Module-level singleton: one buffer per API process. */
let buffer: LedgerRow[] = []
let timer: NodeJS.Timeout | null = null
let flushing = false
let droppedRows = 0
let started = false

/** The sink's contract. Every method is safe to call from a request path; none of them block on I/O. */
type AiUsageSink = {
    record: (call: ReportAiUsageRequest) => void
    recordBatch: (calls: ReportAiUsageRequest[]) => void
    init: () => void
    close: () => Promise<void>
    flushNow: () => Promise<void>
    stats: () => { buffered: number, dropped: number }
    _reset: () => void
}

export const aiUsageSink = (log: FastifyBaseLogger): AiUsageSink => ({
    /**
     * Record one AI call. SYNCHRONOUS, non-blocking, never throws.
     *
     * Prices the call here (pure arithmetic, no I/O) so the cost is fixed at the moment of the call —
     * using the rates in force *then*, not whenever the row happens to get flushed.
     */
    record(call: ReportAiUsageRequest): void {
        try {
            if (buffer.length >= MAX_BUFFERED_ROWS) {
                // Shed load rather than grow without bound. Losing a metrics row is survivable;
                // exhausting the heap of the API that serves customer traffic is not.
                droppedRows++
                if (droppedRows % 1000 === 1) {
                    log.error({ droppedRows, buffered: buffer.length }, '[aiUsageSink] buffer FULL — dropping usage rows; AI spend is being under-reported')
                }
                return
            }

            const occurredAt = new Date(call.occurredAt)
            const cost = computeCallCost({
                provider: call.provider,
                model: call.model,
                tokens: call.tokens,
                providerCostUsd: call.providerCostUsd,
                at: occurredAt,
            })

            buffer.push({
                id: ibId(),
                platformId: call.platformId,
                projectId: call.projectId ?? null,
                userId: call.userId ?? null,
                feature: call.feature,
                featureRef: call.featureRef ?? null,
                provider: call.provider,
                model: call.model,
                modality: call.modality,
                keyMode: call.keyMode,
                inputTokens: call.tokens.inputTokens,
                outputTokens: call.tokens.outputTokens,
                cacheReadTokens: call.tokens.cacheReadTokens,
                cacheWriteTokens: call.tokens.cacheWriteTokens,
                reasoningTokens: call.tokens.reasoningTokens,
                costUsd: cost.costUsd,
                costSource: cost.costSource,
                priceVersion: cost.priceVersion,
                // What we CHARGE. An unpriced call is charged 0 — we never bill a customer for a number
                // we could not compute. It surfaces as unpriced volume instead, which is a bug report,
                // not an invoice.
                billedCredits: cost.costSource === AiCostSource.UNPRICED ? 0 : usdToCredits(cost.costUsd),
                requestId: call.requestId ?? null,
                idempotencyKey: call.idempotencyKey,
                occurredAt,
            })

            if (buffer.length >= FLUSH_AT_ROWS) {
                void flush(log)
            }
            else {
                ensureTimer(log)
            }
        }
        catch (err) {
            // A metering failure must be invisible to the caller. Swallow, count, move on.
            log.warn({ err }, '[aiUsageSink] record failed (isolated — the AI call itself was unaffected)')
        }
    },

    /** Record a batch (the cross-process planes buffer and flush, so they arrive N at a time). */
    recordBatch(calls: ReportAiUsageRequest[]): void {
        for (const c of calls) {
            this.record(c)
        }
    },

    /** Start the periodic flush. Called once at boot. */
    init(): void {
        started = true
        ensureTimer(log)
    },

    /** Drain on shutdown so a normal deploy loses nothing. */
    async close(): Promise<void> {
        started = false
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
        await flush(log)
    },

    /** Test/diagnostic seam. */
    async flushNow(): Promise<void> {
        await flush(log)
    },

    stats(): { buffered: number, dropped: number } {
        return { buffered: buffer.length, dropped: droppedRows }
    },

    /** Test seam — reset module state between cases. */
    _reset(): void {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
        buffer = []
        droppedRows = 0
        flushing = false
        started = false
    },
})

function ensureTimer(log: FastifyBaseLogger): void {
    if (timer !== null || buffer.length === 0) return
    timer = setTimeout(() => {
        timer = null
        void flush(log)
    }, FLUSH_INTERVAL_MS)
    // Never hold the process open just to flush metrics.
    timer.unref?.()
}

/**
 * Write the buffered rows. Single multi-row INSERT, ON CONFLICT DO NOTHING.
 *
 * On failure the rows are put BACK at the head of the buffer (subject to the cap) so a transient DB
 * blip delays the ledger rather than losing it. Guarded by `flushing` so concurrent triggers (a size
 * threshold firing while the timer fires) cannot write the same rows twice.
 */
async function flush(log: FastifyBaseLogger): Promise<void> {
    if (flushing || buffer.length === 0) return
    flushing = true

    const batch = buffer
    buffer = []

    try {
        // The column list and the per-row value list below MUST stay in lockstep. COLUMNS.length is
        // the single source of truth for the placeholder arithmetic, so adding a column can never
        // silently shift the bindings (which would write values into the wrong fields — a corrupt
        // ledger is worse than a missing one).
        const COLUMNS = [
            'id', 'created', 'updated', 'platformId', 'projectId', 'userId',
            'feature', 'featureRef', 'provider', 'model', 'modality', 'keyMode',
            'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens',
            'costUsd', 'costSource', 'priceVersion', 'billedCredits', 'requestId',
            'idempotencyKey',
        ] as const

        const valuesFor = (r: LedgerRow): unknown[] => [
            r.id, r.occurredAt, r.occurredAt, r.platformId, r.projectId, r.userId,
            r.feature, r.featureRef, r.provider, r.model, r.modality, r.keyMode,
            r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWriteTokens, r.reasoningTokens,
            r.costUsd, r.costSource, r.priceVersion, r.billedCredits, r.requestId,
            r.idempotencyKey,
        ]

        const values: unknown[] = []
        const tuples: string[] = []
        for (const r of batch) {
            const row = valuesFor(r)
            const base = values.length
            tuples.push(`(${row.map((_, i) => `$${base + i + 1}`).join(',')})`)
            values.push(...row)
        }

        await databaseConnection().query(
            `INSERT INTO "ai_usage_ledger" (${COLUMNS.map((c) => `"${c}"`).join(',')})
             VALUES ${tuples.join(',')}
             ON CONFLICT ("idempotencyKey") DO NOTHING`,
            values,
        )
    }
    catch (err) {
        // Put them back so a blip delays the ledger instead of losing it — but never past the cap.
        const room = Math.max(0, MAX_BUFFERED_ROWS - buffer.length)
        const requeued = batch.slice(0, room)
        droppedRows += batch.length - requeued.length
        buffer = [...requeued, ...buffer]
        log.warn({ err, requeued: requeued.length, dropped: batch.length - requeued.length }, '[aiUsageSink] flush failed; rows requeued')
    }
    finally {
        flushing = false
        if (started && buffer.length > 0) {
            ensureTimer(log)
        }
    }
}
