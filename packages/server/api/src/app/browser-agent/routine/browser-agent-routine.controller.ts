import {
    GetRoutineResponse,
    IntellisperError,
    ListRoutineRunsRequest,
    ListRoutineRunsResponse,
    ListRoutinesRequest,
    ListRoutinesResponse,
    PrincipalType,
    RecordRoutineRequest,
    RenameRoutineRequest,
    ReorderRoutineStepsRequest,
    ReplayRoutineRequest,
    RoutineProjectRequest,
    SaveRoutineFromRunRequest,
    SaveRoutineResponse,
    UpdateRoutineParamsRequest,
} from '@intelblocks/shared'
import { FastifyReply } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { BROWSER_AGENT_PROTOCOL_VERSION } from '../browser-agent-health.controller'
import type { AgentEvent } from '../engine/agent-engine.types'
import { browserAgentRuntime, type RuntimeScope } from '../runtime/browser-agent-runtime.service'
import { browserAgentRoutine, type RoutineScope } from './browser-agent-routine.service'

/**
 * Routine (record → replay → self-heal) surface. Management routes are ordinary JSON. The
 * deterministic-replay route STREAMS AgentEvents as SSE (same persist-and-resume contract as chat —
 * the run pauses after each action and the extension resumes via /runs/:id/observation).
 *
 * Every route is project-scoped (`securityAccess.project`), and the routine service ADDITIONALLY
 * enforces per-user ownership on every read/write through `agentScope` — a project member cannot see
 * or replay another member's routines (until Phase 9 sharing opt-in).
 */
export const browserAgentRoutineController: FastifyPluginAsyncZod = async (app) => {
    // ── Management (JSON) ────────────────────────────────────────────────────────────────────────

    app.get('/', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'List the acting user\'s saved routines (paginated, optional search).',
            querystring: ListRoutinesRequest,
            response: { [StatusCodes.OK]: ListRoutinesResponse },
        },
    }, async (request, reply) => {
        const result = await browserAgentRoutine(request.log).list(scopeOf(request), request.query.search, request.query.page ?? 1, request.query.limit ?? 50)
        await reply.status(StatusCodes.OK).send(result)
    })

    app.get('/:id', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Load a routine and its ordered steps.',
            params: z.object({ id: z.string() }),
            querystring: RoutineProjectRequest,
            response: { [StatusCodes.OK]: GetRoutineResponse },
        },
    }, async (request, reply) => {
        const { routine, steps } = await browserAgentRoutine(request.log).getWithSteps(scopeOf(request), request.params.id)
        await reply.status(StatusCodes.OK).send({
            routine,
            steps: steps.map((s) => ({ id: s.id, ordinal: s.ordinal, action: s.action, intent: s.intent, locators: s.locators, config: s.config })),
        })
    })

    app.post('/from-run/:runId', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'One-click save: record a routine from a finished run (auto-name + auto-infer params).',
            params: z.object({ runId: z.string() }),
            body: SaveRoutineFromRunRequest,
            response: { [StatusCodes.OK]: SaveRoutineResponse },
        },
    }, async (request, reply) => {
        const result = await browserAgentRoutine(request.log).saveFromRunAuto(scopeOf(request), request.params.runId, { name: request.body.name, description: request.body.description })
        await reply.status(StatusCodes.OK).send(result)
    })

    app.post('/record/:runId', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Record a routine from a finished run with an explicit name + params.',
            params: z.object({ runId: z.string() }),
            body: RecordRoutineRequest,
            response: { [StatusCodes.OK]: SaveRoutineResponse },
        },
    }, async (request, reply) => {
        const result = await browserAgentRoutine(request.log).recordFromRun(scopeOf(request), request.params.runId, request.body.name, { description: request.body.description, params: request.body.params })
        await reply.status(StatusCodes.OK).send(result)
    })

    app.patch('/:id', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Rename a routine / edit its description.',
            params: z.object({ id: z.string() }),
            body: RenameRoutineRequest,
            response: { [StatusCodes.OK]: z.object({ id: z.string(), name: z.string(), version: z.number() }) },
        },
    }, async (request, reply) => {
        const routine = await browserAgentRoutine(request.log).rename(scopeOf(request), request.params.id, request.body.name, request.body.description)
        await reply.status(StatusCodes.OK).send({ id: routine.id, name: routine.name, version: routine.version })
    })

    app.patch('/:id/params', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Replace a routine\'s declared parameters (bumps the version).',
            params: z.object({ id: z.string() }),
            body: UpdateRoutineParamsRequest,
            response: { [StatusCodes.OK]: z.object({ id: z.string(), version: z.number() }) },
        },
    }, async (request, reply) => {
        const routine = await browserAgentRoutine(request.log).updateParams(scopeOf(request), request.params.id, request.body.params)
        await reply.status(StatusCodes.OK).send({ id: routine.id, version: routine.version })
    })

    app.patch('/:id/steps/order', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Reorder a routine\'s steps.',
            params: z.object({ id: z.string() }),
            body: ReorderRoutineStepsRequest,
            response: { [StatusCodes.OK]: z.object({ ordered: z.number() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentRoutine(request.log).reorderSteps(scopeOf(request), request.params.id, request.body.orderedStepIds)
        await reply.status(StatusCodes.OK).send(result)
    })

    app.delete('/:id/steps/:stepId', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Delete one step (ordinals are compacted).',
            params: z.object({ id: z.string(), stepId: z.string() }),
            querystring: RoutineProjectRequest,
            response: { [StatusCodes.OK]: z.object({ removed: z.boolean() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentRoutine(request.log).deleteStep(scopeOf(request), request.params.id, request.params.stepId)
        await reply.status(StatusCodes.OK).send(result)
    })

    app.post('/:id/duplicate', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Duplicate a routine as a new editable copy.',
            params: z.object({ id: z.string() }),
            body: RoutineProjectRequest,
            response: { [StatusCodes.OK]: z.object({ id: z.string(), name: z.string() }) },
        },
    }, async (request, reply) => {
        const copy = await browserAgentRoutine(request.log).duplicate(scopeOf(request), request.params.id)
        await reply.status(StatusCodes.OK).send({ id: copy.id, name: copy.name })
    })

    app.delete('/:id', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Soft-delete a routine.',
            params: z.object({ id: z.string() }),
            querystring: RoutineProjectRequest,
            response: { [StatusCodes.OK]: z.object({ ok: z.boolean() }) },
        },
    }, async (request, reply) => {
        const removed = await browserAgentRoutine(request.log).remove(scopeOf(request), request.params.id)
        await reply.status(StatusCodes.OK).send({ ok: removed })
    })

    app.get('/runs/history', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Recent routine-run history for the acting user (optionally one routine).',
            querystring: ListRoutineRunsRequest,
            response: { [StatusCodes.OK]: ListRoutineRunsResponse },
        },
    }, async (request, reply) => {
        const runs = await browserAgentRoutine(request.log).listRuns(scopeOf(request), request.query.routineId, request.query.limit ?? 50)
        await reply.status(StatusCodes.OK).send({ runs })
    })

    // ── Deterministic replay (SSE) ───────────────────────────────────────────────────────────────

    app.post('/replay', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Start a deterministic replay of a saved routine (SSE stream of AgentEvents).',
            body: ReplayRoutineRequest,
        },
    }, async (request, reply) => {
        const scope = scopeOf(request)
        const { routine, paramValues } = request.body
        await streamSse(reply, browserAgentRuntime(request.log).startReplayRun(scope, routine, paramValues ?? {}, 'interactive'))
    })
}

function scopeOf(request: { projectId: string, principal: { id: string, platform: { id: string } } }): RoutineScope & RuntimeScope {
    return { userId: request.principal.id, platformId: request.principal.platform.id, projectId: request.projectId }
}

/**
 * Drive an AgentEvent generator to the client over SSE (mirrors the chat controller). A throw
 * mid-stream — including an IntellisperError from buildReplayPlan (missing param) or a not-found
 * routine — becomes a final `error` event carrying the human message. The stream always ends.
 */
async function streamSse(reply: FastifyReply, events: AsyncGenerator<AgentEvent>): Promise<void> {
    void reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Intellisper-Protocol': String(BROWSER_AGENT_PROTOCOL_VERSION),
    })
    const write = (evt: AgentEvent) => res.write(`data: ${JSON.stringify(evt)}\n\n`)
    try {
        for await (const evt of events) write(evt)
    }
    catch (err) {
        write({ type: 'error', message: errorMessage(err) })
    }
    finally {
        res.end()
    }
}

/** Human-facing message for a stream error: prefer an IntellisperError's message, else a generic one. */
function errorMessage(err: unknown): string {
    if (err instanceof IntellisperError) {
        const params = err.error?.params as { message?: string } | undefined
        if (params?.message) return params.message
    }
    const httpStatus = (err as { httpStatus?: number }).httpStatus
    if (httpStatus === 404) return 'Not found.'
    if (httpStatus === 400) return (err as Error).message
    return 'Something went wrong.'
}
