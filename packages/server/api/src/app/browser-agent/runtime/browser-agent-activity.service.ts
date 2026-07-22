import {
    AgentOperatorActivityResponse,
    AgentOversightResponse,
    AgentRunStatus,
    AgentRunView,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { AgentRunEntity } from '../entities/browser-agent-core.entity'
import { agentScope } from '../scope/agent-scope'

/**
 * Browser-agent ACTIVITY reads — the three tiers of "who did what with the agent":
 *
 *   Tier 1 (user)         listUserRuns      — the acting user's own runs (owner-scoped).
 *   Tier 2 (tenant admin) platformOverview  — all users on ONE platform (platform-scoped; the caller's
 *                                             own platformId, resolved by the controller from the
 *                                             principal — never from the request).
 *   Tier 3 (operator)     operatorActivity  — cross-tenant, grouped by platformId (operator-gated;
 *                                             the ONLY read here that is not tenant-bounded).
 *
 * SCOPE SAFETY. Every read is either `agentScope.ownerFilter` (tier 1), `agentScope.platformFilter`
 * (tier 2 — tenant-bounded, all users), or the single operator cross-tenant query (tier 3), which is
 * the only one carrying an `agentScope-exempt` marker because it is deliberately cross-tenant and is
 * reachable ONLY behind the operator-key gate + CLOUD-only registration.
 */

const runRepo = repoFactory(AgentRunEntity)

type UserScope = { platformId: string, userId: string }

const RUN_TERMINAL_OK = AgentRunStatus.COMPLETED

export const browserAgentActivity = (_log: FastifyBaseLogger) => ({

    // ── Tier 1: the acting user's own runs ─────────────────────────────────────────────────────────

    async listUserRuns(scope: UserScope, opts: { status?: AgentRunStatus, page?: number, limit?: number }): Promise<{ runs: AgentRunView[], total: number }> {
        const page = Math.max(1, opts.page ?? 1)
        const limit = Math.min(100, Math.max(1, opts.limit ?? 20))

        const qb = runRepo().createQueryBuilder('r')
            // Join the parent conversation for the human-readable task title. The conversation is the
            // SAME owner (platformId+userId) as the run, so the owner filter on the run row is
            // sufficient — the join adds only the title.
            .leftJoin('browser_agent_conversation', 'c', 'c."id" = r."conversationId"')
            .where(agentScope.ownerFilter(scope))
            .orderBy('r.created', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .select([
                'r.id AS id',
                'r."conversationId" AS "conversationId"',
                'c.title AS title',
                'r.status AS status',
                'r."stepCount" AS "stepCount"',
                'r."tokenCost" AS "tokenCost"',
                'r."haltReason" AS "haltReason"',
                'r."startedAt" AS "startedAt"',
                'r."endedAt" AS "endedAt"',
                'r.created AS "createdAt"',
            ])

        const [rows, total] = await Promise.all([
            qb.getRawMany(),
            runRepo().countBy(agentScope.ownerFilter(scope)),
        ])

        return {
            runs: rows.map((r) => ({
                id: r.id,
                conversationId: r.conversationId,
                title: r.title ?? null,
                status: r.status,
                stepCount: Number(r.stepCount ?? 0),
                tokenCost: String(r.tokenCost ?? '0'),
                haltReason: r.haltReason ?? null,
                startedAt: isoOrNull(r.startedAt),
                endedAt: isoOrNull(r.endedAt),
                createdAt: iso(r.createdAt),
            })),
            total,
        }
    },

    // ── Tier 2: tenant-admin platform-wide oversight ───────────────────────────────────────────────

    /**
     * Aggregate agent activity across ALL users of ONE platform. `platformId` MUST be the caller's own
     * (the controller takes it from `request.principal.platform.id`), and every query is bounded by
     * `agentScope.platformFilter`, so this can never read another tenant's rows.
     */
    async platformOverview(ctx: { platformId: string }, days: number): Promise<AgentOversightResponse> {
        const filter = agentScope.platformFilter(ctx) // { platformId } — tenant boundary, all users
        const since = new Date(Date.now() - days * 86_400_000)
        const to = new Date()

        // A fresh, identically-scoped query builder for each aggregate (a query builder is single-use).
        // ALWAYS platform-bounded to the caller's own tenant + the window — no other predicate widens it.
        const scoped = () => runRepo()
            .createQueryBuilder('r')
            .where('r."platformId" = :pid', { pid: filter.platformId })
            .andWhere('r.created >= :since', { since })

        const [totals, byStatus, byDay, byUser, topRoutines] = await Promise.all([
            scoped().select('COUNT(*)', 'runs')
                .addSelect('COUNT(DISTINCT r."userId")', 'users')
                .addSelect('COALESCE(SUM(r."tokenCost"), 0)', 'tokens')
                .addSelect(`COUNT(*) FILTER (WHERE r.status = '${RUN_TERMINAL_OK}')`, 'ok')
                .getRawOne(),
            scoped().select('r.status', 'status').addSelect('COUNT(*)', 'count').groupBy('r.status').getRawMany(),
            scoped().select('TO_CHAR(DATE_TRUNC(\'day\', r.created), \'YYYY-MM-DD\')', 'day').addSelect('COUNT(*)', 'runs')
                .groupBy('DATE_TRUNC(\'day\', r.created)').orderBy('DATE_TRUNC(\'day\', r.created)', 'ASC').getRawMany(),
            scoped().select('r."userId"', 'userId').addSelect('COUNT(*)', 'runs')
                .addSelect('COALESCE(SUM(r."tokenCost"), 0)', 'tokens').addSelect('MAX(r.created)', 'lastRunAt')
                .groupBy('r."userId"').orderBy('COUNT(*)', 'DESC').limit(50).getRawMany(),
            // Top routines by run count, for THIS platform, via the routine_run table (also platform-safe:
            // routine_run carries platformId).
            runRepo().manager.createQueryBuilder()
                .select('rr."routineId"', 'routineId')
                .addSelect('rt.name', 'name')
                .addSelect('COUNT(*)', 'runs')
                .from('browser_agent_routine_run', 'rr')
                .leftJoin('browser_agent_routine', 'rt', 'rt."id" = rr."routineId"')
                .where('rr."platformId" = :pid', { pid: filter.platformId })
                .andWhere('rr.created >= :since', { since })
                .groupBy('rr."routineId"').addGroupBy('rt.name')
                .orderBy('COUNT(*)', 'DESC').limit(10).getRawMany(),
        ])

        const totalRuns = num(totals?.runs)
        const okRuns = num(totals?.ok)

        return {
            from: since.toISOString(),
            to: to.toISOString(),
            totalRuns,
            activeUsers: num(totals?.users),
            totalTokenCost: num(totals?.tokens),
            successRate: totalRuns > 0 ? okRuns / totalRuns : 0,
            runsByStatus: byStatus.map((s) => ({ status: s.status, count: num(s.count) })),
            runsByDay: byDay.map((d) => ({ day: d.day, runs: num(d.runs) })),
            topRoutines: topRoutines.map((t) => ({ routineId: t.routineId, name: t.name ?? null, runs: num(t.runs) })),
            byUser: byUser.map((u) => ({ userId: u.userId, runs: num(u.runs), tokenCost: num(u.tokens), lastRunAt: isoOrNull(u.lastRunAt) })),
        }
    },

    // ── Tier 3: operator (Intellisper) cross-tenant — ENDPOINT ONLY ────────────────────────────────

    /**
     * Cross-tenant agent activity, grouped by platform. This is the OPERATOR view and is the single
     * read in the browser-agent module that is intentionally NOT tenant-bounded. It is reachable ONLY
     * through the operator-key-gated, CLOUD-only admin module — a tenant principal can never call it.
     */
    async operatorActivity(days: number, limit: number): Promise<AgentOperatorActivityResponse> {
        const since = new Date(Date.now() - days * 86_400_000)
        const to = new Date()
        const cappedLimit = Math.min(200, Math.max(1, limit))

        // agentScope-exempt: operator cross-tenant read, gated by the operator API key + CLOUD-only
        // registration (browser-agent-activity-admin.module). Deliberately spans all platforms.
        const rows = await runRepo().createQueryBuilder('r')
            .select('r."platformId"', 'platformId')
            .addSelect('COUNT(*)', 'runs')
            .addSelect('COUNT(DISTINCT r."userId")', 'users')
            .addSelect('COALESCE(SUM(r."tokenCost"), 0)', 'tokens')
            .where('r.created >= :since', { since })
            .groupBy('r."platformId"')
            .orderBy('COUNT(*)', 'DESC')
            .limit(cappedLimit)
            .getRawMany()

        return {
            from: since.toISOString(),
            to: to.toISOString(),
            totalRuns: rows.reduce((a, r) => a + num(r.runs), 0),
            totalTokenCost: rows.reduce((a, r) => a + num(r.tokens), 0),
            platforms: rows.map((r) => ({
                platformId: r.platformId,
                totalRuns: num(r.runs),
                activeUsers: num(r.users),
                totalTokenCost: num(r.tokens),
            })),
        }
    },
})

/** Postgres returns NUMERIC/BIGINT as strings; coerce safely (never NaN into an aggregate). */
function num(v: unknown): number {
    const n = typeof v === 'number' ? v : Number(v ?? 0)
    return Number.isFinite(n) ? n : 0
}

function iso(v: unknown): string {
    if (v instanceof Date) return v.toISOString()
    return typeof v === 'string' ? v : new Date(0).toISOString()
}

function isoOrNull(v: unknown): string | null {
    if (v === null || v === undefined) return null
    if (v instanceof Date) return v.toISOString()
    return typeof v === 'string' ? v : null
}
