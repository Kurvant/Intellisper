import {
    AgentResourceType,
    AgentVisibilityContext,
    isAgentResourceSharable,
} from '@intelblocks/shared'
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm'

/**
 * agentScope — THE single sanctioned way to read/authorize browser-agent data.
 *
 * Enforcement model (plan §4.2/§4.3): every browser-agent repository read MUST compose a predicate
 * built here; no controller/service hand-writes a `where` on an agent table. This is the
 * deny-by-default application-layer guarantee that replaces RLS (rejected for this shared-pool,
 * non-transactional-read codebase). An automated gate test fails the build if any agent-table
 * query bypasses this helper.
 *
 * Visibility rule for a row `r` accessed by user `u` on platform `p`:
 *   r.platformId = p                                            (tenant boundary — ALWAYS)
 *   AND (
 *     r.userId = u                                              (owner always sees own)
 *     OR (
 *       SHARABLE(resourceType)                                  (memory is NEVER sharable)
 *       AND p.agentSharingUnlocked                              (admin unlocked the option)
 *       AND owner(r).agentSharingOptIn = true                   (the OWNER opted in)
 *     )
 *   )
 *
 * Writes are ALWAYS owner-only (`assertOwned`); sharing is read-only visibility.
 */

/** Column names the predicate expects on the aliased agent entity. */
type ScopedColumns = {
    /** Alias of the entity in the query (e.g. 'r'). */
    alias: string
    /** Column holding the owning userId (default 'userId'). */
    userIdColumn?: string
    /** Column holding the platformId (default 'platformId'). */
    platformIdColumn?: string
}

function ownerOnlyBrackets(ctx: AgentVisibilityContext, cols: Required<ScopedColumns>): Brackets {
    return new Brackets((qb) => {
        qb.where(`${cols.alias}."${cols.platformIdColumn}" = :ib_scope_platformId`, {
            ib_scope_platformId: ctx.platformId,
        }).andWhere(`${cols.alias}."${cols.userIdColumn}" = :ib_scope_userId`, {
            ib_scope_userId: ctx.userId,
        })
    })
}

function sharableBrackets(ctx: AgentVisibilityContext, cols: Required<ScopedColumns>): Brackets {
    // Tenant boundary AND (owner OR (sharing unlocked AND owner opted in)). The owner opt-in is
    // resolved via a correlated EXISTS against `user` so a viewer only sees shared rows of owners
    // who themselves opted in — no viewer/owner confusion, no per-owner app-side pre-filter.
    return new Brackets((qb) => {
        qb.where(`${cols.alias}."${cols.platformIdColumn}" = :ib_scope_platformId`, {
            ib_scope_platformId: ctx.platformId,
        }).andWhere(
            new Brackets((inner) => {
                inner.where(`${cols.alias}."${cols.userIdColumn}" = :ib_scope_userId`, {
                    ib_scope_userId: ctx.userId,
                })
                if (ctx.sharingUnlocked) {
                    inner.orWhere(
                        'EXISTS (SELECT 1 FROM "user" ib_owner ' +
                        `WHERE ib_owner."id" = ${cols.alias}."${cols.userIdColumn}" ` +
                        'AND ib_owner."agentSharingOptIn" = true)',
                    )
                }
            }),
        )
    })
}

export const agentScope = {
    /**
     * Apply the visibility predicate to a query builder for a given resource type. Memory (and any
     * always-private type) can never take the sharing branch, regardless of the admin/opt-in
     * switches — enforced structurally here by `isAgentResourceSharable`.
     */
    applyRead<T extends ObjectLiteral>(
        qb: SelectQueryBuilder<T>,
        resourceType: AgentResourceType,
        ctx: AgentVisibilityContext,
        cols: ScopedColumns,
    ): SelectQueryBuilder<T> {
        const resolved: Required<ScopedColumns> = {
            alias: cols.alias,
            userIdColumn: cols.userIdColumn ?? 'userId',
            platformIdColumn: cols.platformIdColumn ?? 'platformId',
        }
        const sharable = isAgentResourceSharable(resourceType) && ctx.sharingUnlocked
        const predicate = sharable
            ? sharableBrackets(ctx, resolved)
            : ownerOnlyBrackets(ctx, resolved)
        return qb.andWhere(predicate)
    },

    /**
     * The owner-only filter as a plain object, for simple `findBy`/`findOneBy` reads that do not
     * need the sharing branch (e.g. mutations, memory, single-owner lookups). Never grants sharing.
     */
    ownerFilter(ctx: Pick<AgentVisibilityContext, 'platformId' | 'userId'>): {
        platformId: string
        userId: string
    } {
        return { platformId: ctx.platformId, userId: ctx.userId }
    },

    /**
     * The PLATFORM-scoped filter — tenant boundary ONLY, no userId. This is the SANCTIONED way for an
     * ADMIN / OPERATOR aggregate to read across the users of a platform (total runs, active users,
     * token spend, top routines) WITHOUT dropping tenant isolation.
     *
     * SECURITY — this deliberately returns rows for ALL users on `platformId`, so it must ONLY ever be
     * called:
     *   - by a controller that has already established the caller is a PLATFORM ADMIN, and
     *   - with `platformId` taken from `request.principal.platform.id` (never from the request body /
     *     query), so a caller can never name a platform they don't own.
     * The operator (cross-tenant) tier does NOT use this — it iterates all platforms behind the
     * operator-key gate and is marked `// agentScope-exempt` at its single call site.
     *
     * Centralising the "platform-wide but tenant-bounded" rule here (rather than letting each admin
     * query hand-write `where platformId = …`) is what keeps the read auditable and keeps the
     * enforcement gate green: an admin aggregate routes through agentScope like every other read.
     */
    platformFilter(ctx: Pick<AgentVisibilityContext, 'platformId'>): { platformId: string } {
        return { platformId: ctx.platformId }
    },

    /**
     * Assert a fetched row is owned by the acting user on the acting platform. Use before any
     * write/mutation. Throws by returning false → callers convert to a 404/403 (never leak
     * existence across the tenant boundary).
     */
    isOwned(
        row: { platformId?: string, userId?: string } | null | undefined,
        ctx: Pick<AgentVisibilityContext, 'platformId' | 'userId'>,
    ): boolean {
        return !!row && row.platformId === ctx.platformId && row.userId === ctx.userId
    },
}
