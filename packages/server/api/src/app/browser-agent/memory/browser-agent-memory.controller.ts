import {
    AgentMemoryScope,
    BulkDeleteMemoryRequest,
    CreateMemoryFactRequest,
    DeleteMemoryFactRequest,
    ErrorCode,
    IntellisperError,
    ListMemoryFactsRequest,
    ListMemoryFactsResponse,
    MemorySettingsResponse,
    PrincipalType,
    RecallMemoryRequest,
    RecallMemoryResponse,
    SetMemoryFactVisibilityRequest,
    UpdateMemoryFactRequest,
    UpdateMemorySettingsRequest,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { memoryPlan } from '../../memory/memory-plan.service'
import { browserAgentMemorySettings } from './browser-agent-memory-settings.service'
import { browserAgentMemory } from './browser-agent-memory.service'

/**
 * The member-facing memory surface, covering both products:
 *   - Intellisper Agent  → scope=USER     (personal memory)
 *   - Intellisper Studio → scope=PLATFORM (org memory) and scope=FLOW (one flow's memory)
 *
 * Every route resolves the acting user from the PRINCIPAL — never from the request body — and the
 * memory service applies the scope predicate. So a USER-scoped call can only ever touch the
 * caller's own facts: there is no parameter on this surface that addresses another member's
 * personal memory, and no admin path lives here (admin reads have their own controller, behind the
 * three-condition gate).
 */
export const browserAgentMemoryController: FastifyPluginAsyncZod = async (app) => {
    /**
     * PAID DOOR — memory's OWN door, resolved from `platform_plan.memoryCaps` and never from the
     * agent's `browserAgentEnabled`. That is what lets a Studio-only platform use org/flow memory
     * with no agent subscription.
     *
     * Every route on this surface — reads included — requires the plan to include memory, or answers
     * 402 with an upgrade prompt. Applied as a plugin-wide preHandler rather than per-route so a
     * route added later cannot forget the check. Reads are gated too: a downgraded plan must stop
     * serving the corpus it no longer pays for (facts are retained, not destroyed — an upgrade
     * restores access intact).
     */
    app.addHook('preHandler', async (request) => {
        await memoryPlan(request.log).assertEnabled({ platformId: request.principal.platform.id })
    })

    const asScope = (request: { principal: { id: string, platform: { id: string } } }) => ({
        userId: request.principal.id,
        platformId: request.principal.platform.id,
    })
    const asTarget = (query: { scope?: AgentMemoryScope, flowId?: string }) => ({
        scope: query.scope ?? AgentMemoryScope.USER,
        flowId: query.flowId,
    })

    app.get('/facts', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'List memory facts in a scope (USER = the caller\'s own, PLATFORM = org, FLOW = one flow).',
            querystring: ListMemoryFactsRequest,
            response: { [StatusCodes.OK]: ListMemoryFactsResponse },
        },
    }, async (request, reply) => {
        const result = await browserAgentMemory(request.log).listFacts(asScope(request), {
            target: asTarget(request.query),
            search: request.query.search,
            kind: request.query.kind,
            page: request.query.page,
            limit: request.query.limit,
        })
        await reply.status(StatusCodes.OK).send(result)
    })

    app.get('/recall', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Semantic recall over a memory scope.',
            querystring: RecallMemoryRequest,
            response: { [StatusCodes.OK]: RecallMemoryResponse },
        },
    }, async (request, reply) => {
        const facts = await browserAgentMemory(request.log).recall(
            asScope(request),
            request.query.q,
            request.query.limit ?? 5,
            asTarget(request.query),
        )
        await reply.status(StatusCodes.OK).send({ facts })
    })

    app.post('/facts', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Add a memory fact by hand. Born PRIVATE; secret-guarded and deduped.',
            body: CreateMemoryFactRequest,
            response: { [StatusCodes.OK]: z.object({ saved: z.boolean(), refused: z.boolean().optional(), id: z.string().optional() }) },
        },
    }, async (request, reply) => {
        const { userId, platformId } = asScope(request)
        // The plan's stored-fact ceiling. Only NEW facts are gated — a user at the ceiling can still
        // edit and delete what they have, so they are never locked out of curating their own memory.
        const room = await memoryPlan(request.log).canStoreMoreFacts({ platformId, userId })
        if (!room.allowed) {
            throw new IntellisperError({
                code: ErrorCode.FEATURE_DISABLED,
                params: { message: `You have reached your plan's memory limit (${room.limit} facts). Delete a fact or upgrade for more.` },
            })
        }
        const result = await browserAgentMemory(request.log).createFact({ userId, platformId }, {
            content: request.body.content,
            kind: request.body.kind,
            target: asTarget(request.body),
        })
        await reply.status(StatusCodes.OK).send(result)
    })

    app.patch('/facts/:id', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Edit a memory fact\'s content or kind (re-embeds on content change).',
            params: z.object({ id: z.string() }),
            body: UpdateMemoryFactRequest,
            response: { [StatusCodes.OK]: z.object({ ok: z.boolean(), refused: z.boolean().optional() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentMemory(request.log).updateFact(asScope(request), request.params.id, {
            content: request.body.content,
            kind: request.body.kind,
        })
        await reply.status(StatusCodes.OK).send(result)
    })

    /**
     * The user's per-fact sharing veto. Only the OWNER can call this for their own USER fact — the
     * service scopes the write by (platformId, userId, scope='USER'). Marking SHARED does not by
     * itself reveal anything; it only makes the fact eligible under the full gate.
     */
    app.post('/facts/:id/visibility', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Mark one of the caller\'s own facts shareable with the platform admin, or return it to permanently private.',
            params: z.object({ id: z.string() }),
            body: SetMemoryFactVisibilityRequest,
            response: { [StatusCodes.OK]: z.object({ ok: z.boolean() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentMemory(request.log).setVisibility(asScope(request), request.params.id, request.body.visibility)
        await reply.status(StatusCodes.OK).send(result)
    })

    app.delete('/facts/:id', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Forget (soft-delete) a memory fact.',
            params: z.object({ id: z.string() }),
            querystring: DeleteMemoryFactRequest,
            response: { [StatusCodes.OK]: z.object({ ok: z.boolean() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentMemory(request.log).forget(asScope(request), request.params.id)
        await reply.status(StatusCodes.OK).send(result)
    })

    app.post('/facts/bulk-delete', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Forget every fact in a scope (the "clear my memory" path).',
            body: BulkDeleteMemoryRequest,
            response: { [StatusCodes.OK]: z.object({ deleted: z.number() }) },
        },
    }, async (request, reply) => {
        const result = await browserAgentMemory(request.log).bulkDelete(asScope(request), asTarget(request.body))
        await reply.status(StatusCodes.OK).send(result)
    })

    /** Data portability: download a scope's facts as JSON. */
    app.get('/facts/export', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Export a memory scope\'s facts.',
            querystring: ListMemoryFactsRequest,
            response: { [StatusCodes.OK]: z.object({ facts: z.array(z.record(z.string(), z.unknown())) }) },
        },
    }, async (request, reply) => {
        const facts = await browserAgentMemory(request.log).exportFacts(asScope(request), asTarget(request.query))
        await reply.status(StatusCodes.OK).send({ facts })
    })

    app.get('/settings', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'The caller\'s memory settings (auto-recall, auto-capture, admin-visibility opt-in).',
            querystring: z.object({ projectId: z.string() }),
            response: { [StatusCodes.OK]: MemorySettingsResponse },
        },
    }, async (request, reply) => {
        const { userId, platformId } = asScope(request)
        const result = await browserAgentMemorySettings(request.log).get(userId, platformId)
        await reply.status(StatusCodes.OK).send(result)
    })

    /**
     * Update the caller's OWN settings, including their admin-visibility opt-in. Scoped to the
     * principal: an admin has no route to opt a member in on their behalf.
     */
    app.post('/settings', {
        config: { security: securityAccess.project([PrincipalType.USER], undefined, { type: ProjectResourceType.QUERY }) },
        schema: {
            tags: ['browser-agent'],
            description: 'Update the caller\'s own memory settings.',
            body: UpdateMemorySettingsRequest,
            response: { [StatusCodes.OK]: MemorySettingsResponse },
        },
    }, async (request, reply) => {
        const { userId, platformId } = asScope(request)
        const result = await browserAgentMemorySettings(request.log).update(userId, platformId, {
            autoRecall: request.body.autoRecall,
            autoCapture: request.body.autoCapture,
            adminVisibilityOptIn: request.body.adminVisibilityOptIn,
        })
        await reply.status(StatusCodes.OK).send(result)
    })
}
