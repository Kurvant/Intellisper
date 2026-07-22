import {
    BrowserAgentActionDecisionRequest,
    BrowserAgentChatRequest,
    BrowserAgentObservationRequest,
    BrowserAgentRunActionRequest,
    IntellisperError,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyBaseLogger, FastifyReply } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { BROWSER_AGENT_PROTOCOL_VERSION } from './browser-agent-health.controller'
import type { AgentEvent } from './engine/agent-engine.types'
import { browserAgentRuntime, type RuntimeScope } from './runtime/browser-agent-runtime.service'

/**
 * The browser-agent chat + run-lifecycle surface. All routes STREAM AgentEvents as SSE. Auth +
 * project scoping run as global preHandlers BEFORE the handler, so by the time we hijack the reply
 * the principal + projectId are resolved. The runtime additionally enforces per-user ownership on
 * every read (a project member cannot see another member's agent runs).
 *
 * The stream deliberately ENDS after an `action` / `awaiting_confirmation` event — the client
 * resumes via /observation or /approve|/reject (the persist-and-resume round-trip).
 */
export const browserAgentChatController: FastifyPluginAsyncZod = async (app) => {
    app.post('/chat', chatRouteConfig(BrowserAgentChatRequest), async (request, reply) => {
        const scope = scopeOf(request)
        const { message, conversationId, page, files } = request.body
        await streamSse(request.log, reply, browserAgentRuntime(request.log).streamTurn(scope, message, conversationId, page ?? null, files ?? null))
    })

    app.post('/runs/:id/observation', runRouteConfig(BrowserAgentObservationRequest), async (request, reply) => {
        const scope = scopeOf(request)
        const { actionId, ok, observation } = request.body
        await streamSse(request.log, reply, browserAgentRuntime(request.log).submitObservation(scope, request.params.id, actionId, observation, ok))
    })

    app.post('/runs/:id/approve', runRouteConfig(BrowserAgentActionDecisionRequest), async (request, reply) => {
        const scope = scopeOf(request)
        await streamSse(request.log, reply, browserAgentRuntime(request.log).approveAction(scope, request.params.id, request.body.actionId))
    })

    app.post('/runs/:id/reject', runRouteConfig(BrowserAgentActionDecisionRequest), async (request, reply) => {
        const scope = scopeOf(request)
        await streamSse(request.log, reply, browserAgentRuntime(request.log).rejectAction(scope, request.params.id, request.body.actionId))
    })

    app.post('/runs/:id/expand', runRouteConfig(BrowserAgentRunActionRequest), async (request, reply) => {
        const scope = scopeOf(request)
        await streamSse(request.log, reply, browserAgentRuntime(request.log).expandResearch(scope, request.params.id))
    })

    app.post('/runs/:id/decline-expand', runRouteConfig(BrowserAgentRunActionRequest), async (request, reply) => {
        const scope = scopeOf(request)
        await streamSse(request.log, reply, browserAgentRuntime(request.log).declineExpansion(scope, request.params.id))
    })
}

function scopeOf(request: { projectId: string, principal: { id: string, platform: { id: string } } }): RuntimeScope {
    return { userId: request.principal.id, platformId: request.principal.platform.id, projectId: request.projectId }
}

/**
 * Drive an AgentEvent generator to the client over SSE. We hijack the reply (bypassing the zod
 * serialiser), write the protocol version, then stream `data: {json}\n\n` frames. A throw mid-stream
 * becomes a final `error` event. The stream always ends with `res.end()`.
 *
 * Because the reply is hijacked, Fastify's errorHandler never runs for these routes — it is the only
 * place that logs a failed request. So anything that throws here (i.e. BEFORE/OUTSIDE the engine's
 * own catch: auth, entitlement, run lookup) must be logged here or it is lost entirely.
 */
async function streamSse(log: FastifyBaseLogger, reply: FastifyReply, events: AsyncGenerator<AgentEvent>): Promise<void> {
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
        log.error({ err }, '[browserAgentChat] stream failed')
        write({ type: 'error', message: sseErrorMessage(err) })
    }
    finally {
        res.end()
    }
}

/**
 * User-facing text for an error thrown outside the engine. An IntellisperError's `.message` is only
 * the CODE (the human text lives in `params.message`), so read params first — otherwise the client
 * renders a bare "VALIDATION". Anything unrecognised stays generic on purpose: it may carry infra
 * detail we must not leak to the extension.
 */
function sseErrorMessage(err: unknown): string {
    if (err instanceof IntellisperError) {
        const detail = (err.error.params as { message?: unknown } | undefined)?.message
        if (typeof detail === 'string' && detail.length > 0) return detail
        return `The agent could not start this turn (${String(err.error.code).toLowerCase().replace(/_/g, ' ')}).`
    }
    const httpStatus = (err as { httpStatus?: number }).httpStatus
    if (httpStatus === 404) return 'Not found.'
    if (httpStatus === 400) return (err as Error).message
    return 'Something went wrong.'
}

function chatRouteConfig<T extends z.ZodTypeAny>(body: T) {
    return {
        config: {
            security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }),
        },
        schema: {
            tags: ['browser-agent'],
            description: 'Start a browser-agent turn (SSE stream of AgentEvents).',
            body,
        },
    }
}

function runRouteConfig<T extends z.ZodTypeAny>(body: T) {
    return {
        config: {
            security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.BODY }),
        },
        schema: {
            tags: ['browser-agent'],
            description: 'Resume/decide a browser-agent run (SSE stream of AgentEvents).',
            params: z.object({ id: z.string() }),
            body,
        },
    }
}
