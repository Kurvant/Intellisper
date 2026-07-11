// Clean-room implementation — internal-admin chat analytics API (capability spec H.2.m).
//
// Operator-scoped, cross-organization read surface at /v1/admin/chat-analytics. DUAL-GATED
// (defense in depth): every route accepts EITHER the operator api-key header (server/CLI/internal
// tooling) OR an authenticated platform-admin JWT (the admin web UI) — and rejects everything else
// (deny-by-default; unset operator key alone does not open the surface). No tenant principal can
// reach it. No secret material is ever returned (provider/model are names only; no connection
// values, provider keys, or raw auth). Conversation detail access is logged.
import {
    IntellisperError,
    IbId,
    ErrorCode,
    isNil,
    PlatformRole,
    Principal,
    PrincipalType,
} from '@intelblocks/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { accessTokenManager } from '../../../../authentication/lib/access-token-manager'
import { securityAccess } from '../../../../core/security/authorization/fastify-security'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'
import { userService } from '../../../../user/user-service'
import { chatAnalyticsService, UsageGroupBy } from './chat-analytics.service'

const OPERATOR_KEY_HEADER = 'api-key'
const DEFAULT_WINDOW_DAYS = 30
const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 200

// Gate: allow if the operator api-key matches, OR the caller is an authenticated platform-admin.
// Deny-by-default otherwise (including when no operator key is configured AND no admin JWT).
async function assertOperatorOrPlatformAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (operatorKeyMatches(request)) {
        return
    }
    if (await isPlatformAdmin(request)) {
        return
    }
    await reply.status(StatusCodes.FORBIDDEN).send({ message: 'Forbidden' })
    throw new Error('Forbidden')
}

function operatorKeyMatches(request: FastifyRequest): boolean {
    const configuredKey = system.get(AppSystemProp.API_KEY)
    const presentedKey = request.headers[OPERATOR_KEY_HEADER] as string | undefined
    return !isNil(configuredKey) && presentedKey === configuredKey
}

async function isPlatformAdmin(request: FastifyRequest): Promise<boolean> {
    const authHeader = request.headers['authorization']
    if (isNil(authHeader) || !authHeader.startsWith('Bearer ')) {
        return false
    }
    const token = authHeader.slice('Bearer '.length)
    let principal: Principal
    try {
        principal = await accessTokenManager(request.log).verifyPrincipal(token)
    }
    catch {
        return false
    }
    if (principal.type !== PrincipalType.USER) {
        return false
    }
    try {
        const user = await userService(request.log).getMetaInformation({ id: principal.id })
        return user.platformRole === PlatformRole.ADMIN
    }
    catch {
        return false
    }
}

export const chatAnalyticsModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preHandler', assertOperatorOrPlatformAdmin)
    await app.register(chatAnalyticsController, { prefix: '/v1/admin/chat-analytics' })
}

const publicRoute = { config: { security: securityAccess.public() } }

// Default [from,to] window: last N days when not supplied.
function resolveRange(query: { from?: string, to?: string }): { from: string, to: string } {
    const to = query.to ?? new Date().toISOString()
    const from = query.from ?? new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    return { from, to }
}

function resolveLimit(limit: number | undefined): number {
    if (isNil(limit) || limit <= 0) {
        return DEFAULT_PAGE_LIMIT
    }
    return Math.min(limit, MAX_PAGE_LIMIT)
}

const UsageQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    platformId: z.string().optional(),
    groupBy: z.enum(['day', 'platform', 'provider', 'model']).optional(),
})

const ByOrgQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    offset: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).optional(),
})

const ConversationsQuery = z.object({
    platformId: z.string().optional(),
    userId: z.string().optional(),
    offset: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).optional(),
})

const chatAnalyticsController: FastifyPluginAsyncZod = async (app) => {
    // Usage / billing summary.
    app.get('/usage', { ...publicRoute, schema: { querystring: UsageQuery } }, async (request) => {
        const { from, to } = resolveRange(request.query)
        return chatAnalyticsService(request.log).usage({
            from,
            to,
            platformId: request.query.platformId,
            groupBy: (request.query.groupBy ?? 'day') as UsageGroupBy,
        })
    })

    // Per-organization rollup.
    app.get('/by-org', { ...publicRoute, schema: { querystring: ByOrgQuery } }, async (request) => {
        const { from, to } = resolveRange(request.query)
        return chatAnalyticsService(request.log).byOrg({
            from,
            to,
            offset: request.query.offset ?? 0,
            limit: resolveLimit(request.query.limit),
        })
    })

    // Recent conversations (ops view) — metadata only, no message bodies.
    app.get('/conversations', { ...publicRoute, schema: { querystring: ConversationsQuery } }, async (request) => {
        return chatAnalyticsService(request.log).conversations({
            platformId: request.query.platformId,
            userId: request.query.userId,
            offset: request.query.offset ?? 0,
            limit: resolveLimit(request.query.limit),
        })
    })

    // Single conversation detail (ops/debug) — metadata + message text. Access is logged.
    app.get('/conversations/:id', { ...publicRoute, schema: { params: z.object({ id: IbId }) } }, async (request) => {
        const detail = await chatAnalyticsService(request.log).conversationDetail(request.params.id)
        if (isNil(detail)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'chat_conversation', entityId: request.params.id },
            })
        }
        request.log.info({ conversationId: request.params.id }, '[chatAnalytics] operator accessed conversation detail')
        return detail
    })

    // Live rollout funnel snapshot.
    app.get('/rollout-funnel', publicRoute, async (request) => {
        return chatAnalyticsService(request.log).rolloutFunnel()
    })
}
