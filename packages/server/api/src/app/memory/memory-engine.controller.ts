import {
    AgentMemoryScope,
    EnginePrincipal,
    EngineRecallMemoryRequest,
    EngineRememberMemoryRequest,
    EngineRememberMemoryResponse,
    isNil,
    MemoryFactKind,
    MemoryFactSource,
    RecallMemoryResponse,
    tryCatch,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { browserAgentMemory } from '../browser-agent/memory/browser-agent-memory.service'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { flowService } from '../flows/flow/flow.service'
import { memoryPlan } from './memory-plan.service'

/**
 * ENGINE-facing memory — the surface a flow step calls from the sandbox.
 *
 * WHY IT IS SEPARATE FROM THE MEMBER SURFACE:
 * A flow runs unattended for the ORGANISATION. Its `EnginePrincipal` carries `projectId` and
 * `platform.id` but no `userId` — a scheduled or webhook run has no person behind it. So this
 * surface admits only the org-owned scopes (PLATFORM, FLOW). Personal memory is not merely blocked
 * here, it is unreachable: there is no user identity to scope it by, and the request DTO has no
 * USER member to ask for.
 *
 * TRUST BOUNDARY — what is taken from the token vs the request:
 *  - `platformId` / `projectId`  → ALWAYS the token. Never read from the body.
 *  - `flowId`                    → comes from the body (the engine token does not carry one), and is
 *    therefore VERIFIED against the token's projectId via `flowService.getOne`, which filters on
 *    (id, projectId). A flow naming another project's flow id simply finds nothing. Without that
 *    check, any flow could read any other flow's memory by guessing an id.
 *
 * FAILURE POSTURE: memory is an enhancement to a step, never a precondition. Every path here
 * degrades quietly — no memory on the plan, no pgvector, an embedding hiccup — the step runs
 * without memory rather than failing the customer's automation.
 */
export const memoryEngineController: FastifyPluginAsyncZod = async (app) => {
    app.post('/recall', RecallRequest, async (request, reply) => {
        const principal = request.principal as EnginePrincipal
        const platformId = principal.platform.id

        if (!(await memoryPlan(request.log).isEnabled({ platformId }))) {
            await reply.status(StatusCodes.OK).send({ facts: [] })
            return
        }

        const target = await resolveEngineTarget({
            log: request.log,
            principal,
            scope: request.body.scope,
            flowId: request.body.flowId,
        })
        if (isNil(target)) {
            await reply.status(StatusCodes.OK).send({ facts: [] })
            return
        }

        const caps = await memoryPlan(request.log).capsForPlatform({ platformId })
        const k = Math.min(
            request.body.limit ?? browserAgentMemory(request.log).recallKForTier(caps.recallTier),
            25,
        )
        // `userId` is required by the service's scope type but is unused for org-owned targets (see
        // targetPredicate) — the engine has no user, so the principal's own id stands in and can
        // never select a USER fact, because this surface never asks for USER scope.
        //
        // `recall` propagates an embedding failure (no model key, provider down). For an interactive
        // caller that surfaces as an error the user can act on, but a FLOW must never fail because
        // memory was unavailable — the automation's actual job has nothing to do with memory. So the
        // fault is absorbed here and the step proceeds with no facts.
        const { data: facts, error } = await tryCatch(() => browserAgentMemory(request.log).recall(
            { userId: principal.id, platformId },
            request.body.q,
            k,
            target,
        ))
        if (!isNil(error) || isNil(facts)) {
            request.log.warn(
                { err: error?.message, platformId },
                '[memoryEngine] recall failed — flow continues without memory',
            )
            await reply.status(StatusCodes.OK).send({ facts: [] })
            return
        }
        await reply.status(StatusCodes.OK).send({ facts })
    })

    app.post('/remember', RememberRequest, async (request, reply) => {
        const principal = request.principal as EnginePrincipal
        const platformId = principal.platform.id

        if (!(await memoryPlan(request.log).isEnabled({ platformId }))) {
            await reply.status(StatusCodes.OK).send({ saved: false })
            return
        }

        const target = await resolveEngineTarget({
            log: request.log,
            principal,
            scope: request.body.scope,
            flowId: request.body.flowId,
        })
        if (isNil(target)) {
            await reply.status(StatusCodes.OK).send({ saved: false })
            return
        }

        // The stored-fact ceiling is per (platform, user); org-owned facts are written under the
        // engine's principal id, so this bounds a flow's corpus without touching any member's.
        const room = await memoryPlan(request.log).canStoreMoreFacts({ platformId, userId: principal.id })
        if (!room.allowed) {
            await reply.status(StatusCodes.OK).send({ saved: false })
            return
        }

        // Same posture as recall: a failed save must not fail the customer's automation.
        const { data: result, error } = await tryCatch(() => browserAgentMemory(request.log).remember(
            { userId: principal.id, platformId },
            request.body.content,
            request.body.kind ?? MemoryFactKind.NOTE,
            MemoryFactSource.AUTO,
            target.scope,
            target.flowId,
        ))
        if (!isNil(error) || isNil(result)) {
            request.log.warn(
                { err: error?.message, platformId },
                '[memoryEngine] remember failed — flow continues without saving',
            )
            await reply.status(StatusCodes.OK).send({ saved: false })
            return
        }
        await reply.status(StatusCodes.OK).send(result)
    })
}

/**
 * Resolve the org-owned memory target for an engine call, or null when it must not proceed.
 *
 * FLOW scope is only granted once `flowService.getOne({ id, projectId })` confirms the flow belongs
 * to the token's project — that lookup is the whole cross-flow isolation guarantee. Returning null
 * (rather than throwing) keeps the caller's failure posture: the step continues without memory.
 */
async function resolveEngineTarget({ log, principal, scope, flowId }: ResolveEngineTargetParams): Promise<{ scope: AgentMemoryScope, flowId?: string } | null> {
    const requested = scope ?? AgentMemoryScope.PLATFORM
    if (requested === AgentMemoryScope.PLATFORM) {
        return { scope: AgentMemoryScope.PLATFORM }
    }
    if (isNil(flowId)) {
        return null
    }
    const flow = await flowService(log).getOne({ id: flowId, projectId: principal.projectId })
    if (isNil(flow)) {
        log.warn(
            { flowId, projectId: principal.projectId },
            '[memoryEngine] flow-scoped memory requested for a flow outside the caller\'s project — denied',
        )
        return null
    }
    return { scope: AgentMemoryScope.FLOW, flowId }
}

const RecallRequest = {
    config: { security: securityAccess.engine() },
    schema: {
        tags: ['memory'],
        description: 'Flow-step memory recall (org/flow scope only; a flow has no user identity).',
        body: EngineRecallMemoryRequest.extend({ flowId: z.string().optional() }),
        response: { [StatusCodes.OK]: RecallMemoryResponse },
    },
}

const RememberRequest = {
    config: { security: securityAccess.engine() },
    schema: {
        tags: ['memory'],
        description: 'Flow-step memory write (org/flow scope only). Secret-guarded and deduped.',
        body: EngineRememberMemoryRequest.extend({ flowId: z.string().optional() }),
        response: { [StatusCodes.OK]: EngineRememberMemoryResponse },
    },
}

type ResolveEngineTargetParams = {
    log: Parameters<typeof flowService>[0]
    principal: EnginePrincipal
    scope: AgentMemoryScope | undefined
    flowId: string | undefined
}
