import {
    BatchCreatedResponse,
    BatchProjectRequest,
    ClaimWorkResponse,
    CreateBatchRequest,
    CreateScheduleRequest,
    ErrorCode,
    GetBatchResponse,
    IbMultipartFile,
    IntellisperError,
    ListBatchesRequest,
    ListBatchesResponse,
    ListSchedulesRequest,
    ListSchedulesResponse,
    PrincipalType,
    ScheduleProjectRequest,
    SetScheduleEnabledRequest,
    UploadBatchRequest,
    WorkPresenceRequest,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { claimNextAction, type RuntimeScope } from '../runtime/browser-agent-runtime.service'
import { browserAgentPlan } from '../usage/browser-agent-plan.service'
import { normaliseRows, parseBatchFile } from './batch-input'
import { batchDeps, scheduleDeps } from './browser-agent-automation.jobs'
import { browserAgentBatch } from './browser-agent-batch.service'
import { browserAgentSchedule } from './browser-agent-schedule.service'
import { browserAgentPresence } from './presence.service'

/**
 * Automation surface: batch (run a routine across many rows), schedule (cron re-run), and the work
 * pipeline (extension presence heartbeat + claim-next-action). All project-scoped; the batch/schedule
 * services additionally enforce per-user ownership via `agentScope`. Batches/schedules run on the
 * user's LIVE session — a batch row waits for the connected extension, never headless.
 *
 * The batch/schedule services take injected queue deps (`batchDeps`/`scheduleDeps`) so they stay
 * decoupled + unit-testable; this controller supplies the real ones.
 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const browserAgentAutomationController: FastifyPluginAsyncZod = async (app) => {
    // ── Batch ────────────────────────────────────────────────────────────────────────────────────

    app.post('/batches', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Create a batch from structured rows (run a routine across many parameter sets).',
            body: CreateBatchRequest,
            response: { [StatusCodes.OK]: BatchCreatedResponse },
        },
    }, async (request, reply) => {
        const scope = scopeOf(request)
        const rows = normaliseRows(request.body.rows)
        const caps = await browserAgentPlan(request.log).capsForPlatform(scope.platformId)
        const batch = await browserAgentBatch(request.log, batchDeps).create(scope, {
            routineId: request.body.routineId,
            paramSets: rows,
            concurrency: request.body.concurrency,
            notify: request.body.notify ?? null,
            caps: { maxBatchRows: caps.maxBatchRows, maxConcurrentRows: caps.maxConcurrentRows },
        })
        await reply.status(StatusCodes.OK).send({ id: batch.id, status: batch.status, rowsTotal: batch.rowsTotal })
    })

    app.post('/batches/upload', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Create a batch from an uploaded CSV/Excel file (sanitised server-side).',
            consumes: ['multipart/form-data'],
            querystring: UploadBatchRequest,
            body: z.object({ file: IbMultipartFile }),
            response: { [StatusCodes.OK]: BatchCreatedResponse },
        },
    }, async (request, reply) => {
        const scope = scopeOf(request)
        const file = request.body.file as IbMultipartFile
        if (file.data.length > MAX_UPLOAD_BYTES) {
            throw new IntellisperError({ code: ErrorCode.VALIDATION, params: { message: 'File is too large (max 5MB).' } })
        }
        const rows = await parseBatchFile(file.data, file.mimetype ?? '', file.filename ?? '')
        const caps = await browserAgentPlan(request.log).capsForPlatform(scope.platformId)
        const batch = await browserAgentBatch(request.log, batchDeps).create(scope, {
            routineId: request.query.routineId,
            paramSets: rows,
            concurrency: request.query.concurrency,
            caps: { maxBatchRows: caps.maxBatchRows, maxConcurrentRows: caps.maxConcurrentRows },
        })
        await reply.status(StatusCodes.OK).send({ id: batch.id, status: batch.status, rowsTotal: batch.rowsTotal })
    })

    app.get('/batches', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'List the acting user\'s batches (most recent first).',
            querystring: ListBatchesRequest,
            response: { [StatusCodes.OK]: ListBatchesResponse },
        },
    }, async (request, reply) => {
        const batches = await browserAgentBatch(request.log, batchDeps).list(scopeOf(request), request.query.limit ?? 50)
        await reply.status(StatusCodes.OK).send({ batches })
    })

    app.get('/batches/:id', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Batch detail + per-row statuses.',
            params: z.object({ id: z.string() }),
            querystring: BatchProjectRequest,
            response: { [StatusCodes.OK]: GetBatchResponse },
        },
    }, async (request, reply) => {
        const { batch, rows } = await browserAgentBatch(request.log, batchDeps).get(scopeOf(request), request.params.id)
        await reply.status(StatusCodes.OK).send({
            batch,
            rows: rows.map((r) => ({ id: r.id, rowIndex: r.rowIndex, status: r.status, agentRunId: r.agentRunId })),
        })
    })

    app.post('/batches/:id/cancel', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Cancel a batch (pending rows stop; running rows finish their current step).',
            params: z.object({ id: z.string() }),
            body: BatchProjectRequest,
            response: { [StatusCodes.OK]: z.object({ canceled: z.boolean() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentBatch(request.log, batchDeps).cancel(scopeOf(request), request.params.id)
        await reply.status(StatusCodes.OK).send(result)
    })

    app.post('/batches/:id/retry-failed', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Re-run only the failed rows of a batch.',
            params: z.object({ id: z.string() }),
            body: BatchProjectRequest,
            response: { [StatusCodes.OK]: z.object({ requeued: z.number() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentBatch(request.log, batchDeps).retryFailed(scopeOf(request), request.params.id)
        await reply.status(StatusCodes.OK).send(result)
    })

    app.get('/batches/:id/export', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Export a batch\'s aggregated extracted output (JSON records).',
            params: z.object({ id: z.string() }),
            querystring: BatchProjectRequest,
            response: { [StatusCodes.OK]: z.object({ output: z.array(z.record(z.string(), z.unknown())) }) },
        },
    }, async (request, reply) => {
        const output = await browserAgentBatch(request.log, batchDeps).exportOutput(scopeOf(request), request.params.id)
        await reply.status(StatusCodes.OK).send({ output })
    })

    // ── Schedule ───────────────────────────────────────────────────────────────────────────────────

    app.post('/schedules', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Create a cron schedule that re-runs a routine (spawns a batch on each firing).',
            body: CreateScheduleRequest,
            response: { [StatusCodes.OK]: z.object({ id: z.string(), name: z.string(), enabled: z.boolean() }) },
        },
    }, async (request, reply) => {
        const scheduleScope = scopeOf(request)
        const caps = await browserAgentPlan(request.log).capsForPlatform(scheduleScope.platformId)
        const sched = await browserAgentSchedule(request.log, scheduleDeps).create(scheduleScope, {
            routineId: request.body.routineId,
            name: request.body.name,
            cron: request.body.cron,
            timezone: request.body.timezone,
            paramSets: request.body.paramSets ?? null,
            notify: request.body.notify ?? null,
            maxSchedules: caps.maxSchedules,
        })
        await reply.status(StatusCodes.OK).send({ id: sched.id, name: sched.name, enabled: sched.enabled })
    })

    app.get('/schedules', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'List the acting user\'s schedules.',
            querystring: ListSchedulesRequest,
            response: { [StatusCodes.OK]: ListSchedulesResponse },
        },
    }, async (request, reply) => {
        const schedules = await browserAgentSchedule(request.log, scheduleDeps).list(scopeOf(request))
        await reply.status(StatusCodes.OK).send({ schedules })
    })

    app.patch('/schedules/:id/enabled', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Enable or disable a schedule (registers/deregisters its cron job).',
            params: z.object({ id: z.string() }),
            body: SetScheduleEnabledRequest,
            response: { [StatusCodes.OK]: z.object({ id: z.string(), enabled: z.boolean() }) },
        },
    }, async (request, reply) => {
        const sched = await browserAgentSchedule(request.log, scheduleDeps).setEnabled(scopeOf(request), request.params.id, request.body.enabled)
        await reply.status(StatusCodes.OK).send({ id: sched.id, enabled: sched.enabled })
    })

    app.delete('/schedules/:id', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Delete a schedule (deregisters its cron job).',
            params: z.object({ id: z.string() }),
            querystring: ScheduleProjectRequest,
            response: { [StatusCodes.OK]: z.object({ removed: z.boolean() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentSchedule(request.log, scheduleDeps).remove(scopeOf(request), request.params.id)
        await reply.status(StatusCodes.OK).send(result)
    })

    // ── Work / presence (extension) ─────────────────────────────────────────────────────────────

    app.post('/presence/heartbeat', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'HTTP presence heartbeat (fallback to the socket); marks the extension live.',
            body: WorkPresenceRequest,
            response: { [StatusCodes.OK]: z.object({ ok: z.boolean() }) },
        },
    }, async (request, reply) => {
        await browserAgentPresence(request.log).heartbeat(request.principal.id)
        await reply.status(StatusCodes.OK).send({ ok: true })
    })

    app.get('/work/claim', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Claim the next pending unattended action to execute (null when idle).',
            querystring: WorkPresenceRequest,
            response: { [StatusCodes.OK]: ClaimWorkResponse },
        },
    }, async (request, reply) => {
        // Claiming implies the extension is live.
        await browserAgentPresence(request.log).heartbeat(request.principal.id)
        const work = await claimNextAction(scopeOf(request))
        await reply.status(StatusCodes.OK).send({ work })
    })
}

function scopeOf(request: { projectId: string, principal: { id: string, platform: { id: string } } }): RuntimeScope {
    return { userId: request.principal.id, platformId: request.principal.platform.id, projectId: request.projectId }
}
