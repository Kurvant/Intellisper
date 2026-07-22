import {
    AdminMemoryOverviewResponse,
    ListAdminMemoryRequest,
    ListAdminMemoryResponse,
    PrincipalType,
    SetMemorySharingUnlockedRequest,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { memoryPlan } from '../../memory/memory-plan.service'
import { browserAgentMemoryAdminSettings } from './browser-agent-memory-settings.service'
import { browserAgentMemory } from './browser-agent-memory.service'

/**
 * Tier 2 — TENANT-ADMIN memory governance for the caller's OWN platform.
 *
 * WHAT AN ADMIN CAN SEE HERE — and, more importantly, what they cannot:
 *
 *   ✓ PLATFORM (org) and FLOW memory — org-owned knowledge, admin-governed by design.
 *   ✓ A member's USER fact ONLY when all three conditions hold at read time:
 *        1. the admin has unlocked sharing for the platform,
 *        2. the member has opted in to admin visibility, AND
 *        3. the member marked THAT SPECIFIC fact as SHARED.
 *   ✗ Anything else. A fact a member left PRIVATE is unreachable through this controller even when
 *     that member has opted in — the opt-in only ever covers facts they individually marked. This is
 *     the member's absolute veto and there is no admin route, parameter, or escalation that lifts it.
 *
 * The gate is a single indivisible SQL predicate in `browserAgentMemory.adminListFacts` — this
 * controller cannot weaken it, because it exposes no parameter that touches those conditions.
 *
 * SCOPE SAFETY — the same two guarantees as the oversight controller:
 *   1. `platformAdminOnly` asserts the caller is a PlatformRole.ADMIN of their own platform.
 *   2. `platformId` is taken from the authenticated PRINCIPAL, never from the request, so an admin
 *      cannot name another platform.
 */
export const browserAgentMemoryAdminController: FastifyPluginAsyncZod = async (app) => {
    /**
     * PAID DOOR — the same door the member surface enforces, and for the same reason: a plan without
     * memory must not serve a corpus it does not pay for. Governance reads are still reads of the
     * corpus, and `/sharing` writes the outermost gate condition, so every route here is covered.
     *
     * Applied plugin-wide rather than per-route so a route added later cannot forget the check —
     * mirroring `browser-agent-memory.controller.ts`. Facts are retained on a downgrade, not
     * destroyed; an upgrade restores admin visibility intact.
     */
    app.addHook('preHandler', async (request) => {
        await memoryPlan(request.log).assertEnabled({ platformId: request.principal.platform.id })
    })

    app.get('/', {
        config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) },
        schema: {
            tags: ['browser-agent'],
            description: 'Tenant-admin: platform memory governance summary (org/flow counts, shared-fact count, opt-in rate).',
            response: { [StatusCodes.OK]: AdminMemoryOverviewResponse },
        },
    }, async (request, reply) => {
        const platformId = request.principal.platform.id
        const overview = await browserAgentMemory(request.log).adminOverview(platformId)
        await reply.status(StatusCodes.OK).send(overview)
    })

    /**
     * The gated read. Returns org/flow memory plus ONLY those USER facts passing all three
     * conditions — see the service's `adminListFacts`, which is the sole cross-owner memory query
     * in the system.
     */
    app.get('/facts', {
        config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) },
        schema: {
            tags: ['browser-agent'],
            description: 'Tenant-admin: org and flow memory, plus only those member facts explicitly shared under the three-condition gate.',
            querystring: ListAdminMemoryRequest,
            response: { [StatusCodes.OK]: ListAdminMemoryResponse },
        },
    }, async (request, reply) => {
        // platformId from the PRINCIPAL — the tenant-isolation guarantee of this route.
        const platformId = request.principal.platform.id
        const result = await browserAgentMemory(request.log).adminListFacts(platformId, {
            scope: request.query.scope,
            search: request.query.search,
            page: request.query.page,
            limit: request.query.limit,
        })
        await reply.status(StatusCodes.OK).send(result)
    })

    /**
     * Flip the platform-wide sharing capability — the OUTERMOST condition of the gate, and the only
     * one an admin controls. Unlocking shares nothing by itself: it merely lets members who choose
     * to opt in have their individually-SHARED facts become visible. Locking it hides every shared
     * fact instantly, without destroying anyone's marks or opt-in.
     */
    app.post('/sharing', {
        config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) },
        schema: {
            tags: ['browser-agent'],
            description: 'Tenant-admin: unlock or lock member memory sharing platform-wide. Does not itself expose any member data.',
            body: SetMemorySharingUnlockedRequest,
            response: { [StatusCodes.OK]: z.object({ sharingUnlocked: z.boolean() }) },
        },
    }, async (request, reply) => {
        const platformId = request.principal.platform.id
        const result = await browserAgentMemoryAdminSettings.setSharingUnlocked(platformId, request.body.unlocked)
        await reply.status(StatusCodes.OK).send(result)
    })
}
