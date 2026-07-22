import { AgentBatchJobStatus, isNil, RoutineRunStatus } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { SystemJobName } from '../../helper/system-jobs/common'
import { systemJobHandlers } from '../../helper/system-jobs/job-handlers'
import { systemJobsQueue, systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { AgentBatchJobEntity, RoutineRunEntity } from '../entities'
import { setBrowserAgentBatchHooks, startBatchRow } from '../runtime/browser-agent-runtime.service'
import { browserAgentNotifier } from './automation-notifier'
import { type BatchDeps, browserAgentBatch } from './browser-agent-batch.service'
import { browserAgentSchedule, type ScheduleDeps } from './browser-agent-schedule.service'
import { browserAgentPresence } from './presence.service'

/**
 * Automation ↔ infra wiring (Phase 8). Owns the concrete `systemJobs` queue integration so the
 * batch/schedule SERVICES stay decoupled + unit-testable (they take injected deps). Provides:
 *  - `batchDeps` / `scheduleDeps` — the real queue-backed side effects the services call.
 *  - `registerBrowserAgentAutomationJobs(log)` — registers the two system-job handlers + wires the
 *    runtime's batch hooks. Called once at boot from app.ts (CLOUD/ENTERPRISE), alongside the other
 *    system-job handler registrations.
 *
 * Admission control (mirrors the source design): a batch ROW is a one-time `BROWSER_AGENT_BATCH_ROW`
 * system job. The handler gates on presence + per-user concurrency: extension offline → re-defer;
 * concurrency full → short re-defer; else take a slot + kick off the row's deterministic replay
 * (persists the first action) + nudge the extension. The row then advances via the extension ↔
 * /observation pipeline; `onBatchRowDone` releases the slot + advances the parent when it terminates.
 *
 * agentScope-exempt: this is a TRUSTED queue handler. Its DB reads are BY PRIMARY KEY (a batch /
 * routine_run by the id the queue enqueued) — the scope for the kicked-off run is derived from the
 * batch's OWN platformId/userId, and ownership was enforced upstream when the batch was created via
 * the owner-scoped batch service. There is no client-supplied ownership boundary to re-check here.
 */

const batchRepo = repoFactory(AgentBatchJobEntity)
const routineRunRepo = repoFactory(RoutineRunEntity)

const OFFLINE_RETRY_MS = 30_000
const BUSY_RETRY_MS = 5_000
const MAX_ADMISSION_ATTEMPTS = 240 // ~2h of 30s offline re-defers before giving up on a row

/** Presence nudge: push a 'work-available' event to the user's socket room (set by the gateway). */
let workNudge: (userId: string) => void = () => { /* no-op until the gateway wires it */ }
export function setBrowserAgentWorkNudge(fn: (userId: string) => void): void {
    workNudge = fn
}

/** Enqueue a one-time admission tick for a batch row (idempotent on jobId = routineRunId). */
async function enqueueRow(batchJobId: string, routineRunId: string, delayMs = 0): Promise<void> {
    await systemJobsQueue.add(SystemJobName.BROWSER_AGENT_BATCH_ROW, { batchJobId, routineRunId }, {
        jobId: `ba-row:${routineRunId}`,
        delay: delayMs,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 1000,
    })
}

/** Remove a still-queued row admission job (cancel). Best-effort. */
async function dequeueRow(routineRunId: string): Promise<void> {
    try {
        const job = await systemJobsQueue.getJob(`ba-row:${routineRunId}`)
        await job?.remove()
    }
    catch { /* best-effort */ }
}

/** The batch service's injected side effects (real queue + presence nudge). */
export const batchDeps: BatchDeps = {
    enqueueRow: (batchJobId, routineRunId) => enqueueRow(batchJobId, routineRunId, 0),
    dequeueRow,
    notifyWorkAvailable: (userId) => workNudge(userId),
}

/** The schedule service's injected side effects (per-schedule repeated system job). */
export const scheduleDeps: ScheduleDeps = {
    async register(scheduleId, cron, timezone) {
        await systemJobsSchedule(loggerRef).upsertJob({
            job: { name: SystemJobName.BROWSER_AGENT_SCHEDULE_FIRE, data: { scheduleId }, jobId: `ba-sched:${scheduleId}` },
            schedule: { type: 'repeated', cron },
            customConfig: { repeat: { pattern: cron, tz: timezone } },
        })
        return `ba-sched:${scheduleId}`
    },
    async deregister(scheduleId, _repeatJobKey) {
        try {
            const job = await systemJobsSchedule(loggerRef).getJob(`ba-sched:${scheduleId}`)
            if (!isNil(job) && !isNil(job.opts?.repeat)) {
                await systemJobsQueue.removeRepeatable(SystemJobName.BROWSER_AGENT_SCHEDULE_FIRE, job.opts.repeat)
            }
        }
        catch { /* best-effort */ }
    },
}

// The schedule deps need a logger for systemJobsSchedule(log); set once at registration.
let loggerRef: FastifyBaseLogger

/**
 * Register the two system-job handlers + wire the runtime batch hooks. Idempotent-safe to call once
 * per boot. Handlers run IN-PROCESS in the API (system-jobs BullMQ worker).
 */
export function registerBrowserAgentAutomationJobs(log: FastifyBaseLogger): void {
    loggerRef = log

    // Runtime → batch decoupling: advance counters / release slot on terminal; email on parked
    // consequential step. (These are the SAME hooks the source product's AutomationModule wires.)
    setBrowserAgentBatchHooks({
        onBatchRowDone: (batchJobId, agentRunId, succeeded) => browserAgentBatch(log, batchDeps).onRowDone(batchJobId, agentRunId, succeeded),
        onNeedsAttention: (runId, userId, batchJobId, what) => browserAgentNotifier(log).needsAttention(userId, batchJobId, what),
    })

    // Schedule firing → spawn a batch (1 row of defaults, or N from paramSets).
    systemJobHandlers.registerJobHandler(SystemJobName.BROWSER_AGENT_SCHEDULE_FIRE, async ({ scheduleId }) => {
        const firing = await browserAgentSchedule(log, scheduleDeps).resolveFiring(scheduleId)
        if (!firing) return
        try {
            await browserAgentBatch(log, batchDeps).create(firing.scope, {
                routineId: firing.routineId,
                paramSets: firing.paramSets,
                notify: firing.notify,
                scheduleId,
            })
        }
        catch (err) {
            log.warn({ err: (err as Error).message, scheduleId }, '[browserAgentAutomation] schedule fire failed')
        }
    })

    // Batch row admission tick.
    systemJobHandlers.registerJobHandler(SystemJobName.BROWSER_AGENT_BATCH_ROW, async ({ batchJobId, routineRunId, attempt }) => {
        await admitBatchRow(log, batchJobId, routineRunId, attempt ?? 0)
    })
}

/**
 * Admission control for one batch row (the system-job handler body). Runs on the user's LIVE session
 * only: extension offline → re-defer; per-user concurrency full → short re-defer; else take a slot +
 * kick off the row. NEVER headless.
 */
async function admitBatchRow(log: FastifyBaseLogger, batchJobId: string, routineRunId: string, attempt: number): Promise<void> {
    const batch = await batchRepo().findOneBy({ id: batchJobId })
    if (isNil(batch)) return // batch deleted
    if (batch.status === AgentBatchJobStatus.CANCELED || batch.status === AgentBatchJobStatus.FAILED) return

    const row = await routineRunRepo().findOneBy({ id: routineRunId })
    if (isNil(row) || row.status !== RoutineRunStatus.PENDING) return // already handled

    const scope = { userId: batch.userId, platformId: batch.platformId, projectId: batch.projectId }
    const presence = browserAgentPresence(log)

    // 1. Connected-session gate.
    if (!(await presence.isConnected(batch.userId))) {
        if (attempt >= MAX_ADMISSION_ATTEMPTS) {
            // Give up on this row after too many offline re-defers → fail it (releases nothing; no slot held).
            await routineRunRepo().update({ id: row.id }, { status: RoutineRunStatus.FAILED })
            await browserAgentBatch(log, batchDeps).onRowDone(batchJobId, '', false)
            return
        }
        if (batch.status === AgentBatchJobStatus.PENDING || batch.status === AgentBatchJobStatus.RUNNING) {
            await batchRepo().update({ id: batch.id }, { status: AgentBatchJobStatus.PAUSED_WAITING_EXTENSION })
        }
        await requeue(batchJobId, routineRunId, attempt + 1, OFFLINE_RETRY_MS)
        return
    }

    // 2. Per-user concurrency gate.
    const inflight = await presence.getInflight(batch.userId)
    if (inflight >= Math.max(1, batch.concurrency)) {
        await requeue(batchJobId, routineRunId, attempt + 1, BUSY_RETRY_MS)
        return
    }

    // 3. Admit: take a slot, mark batch running, kick off the row.
    await presence.incrInflight(batch.userId)
    try {
        if (batch.status !== AgentBatchJobStatus.RUNNING) {
            await batchRepo().update({ id: batch.id }, { status: AgentBatchJobStatus.RUNNING, startedAt: batch.startedAt ?? new Date().toISOString() })
        }
        const runId = await startBatchRow(log, scope, batch.id, { id: row.id, routineId: row.routineId, paramValues: row.paramValues ?? null })
        if (!runId) {
            await routineRunRepo().update({ id: row.id }, { status: RoutineRunStatus.FAILED })
            await presence.decrInflight(batch.userId)
            await browserAgentBatch(log, batchDeps).onRowDone(batch.id, '', false)
            return
        }
        // Row is in flight (awaiting the extension). Slot released by onBatchRowDone at terminal.
        workNudge(batch.userId)
    }
    catch (err) {
        await presence.decrInflight(batch.userId)
        log.error({ err: (err as Error).message, routineRunId }, '[browserAgentAutomation] batch row kickoff error')
        await routineRunRepo().update({ id: row.id }, { status: RoutineRunStatus.FAILED })
        await browserAgentBatch(log, batchDeps).onRowDone(batch.id, '', false)
    }
}

/** Re-enqueue a row admission tick after a delay (offline/busy), carrying the attempt counter. */
async function requeue(batchJobId: string, routineRunId: string, attempt: number, delayMs: number): Promise<void> {
    await systemJobsQueue.add(SystemJobName.BROWSER_AGENT_BATCH_ROW, { batchJobId, routineRunId, attempt }, {
        jobId: `ba-row:${routineRunId}:${attempt}`,
        delay: delayMs,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 1000,
    })
}
