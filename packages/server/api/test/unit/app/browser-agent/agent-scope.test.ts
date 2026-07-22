import {
    AgentAlwaysPrivateResourceType,
    AgentSharableResourceType,
    AgentVisibilityContext,
    isAgentResourceSharable,
} from '@intelblocks/shared'
import { DataSource } from 'typeorm'
import { beforeAll, describe, expect, it } from 'vitest'
import { agentScope } from '../../../../src/app/browser-agent/scope/agent-scope'

/**
 * Pure unit tests for the mandatory scope helper. We build a real (unconnected) TypeORM
 * QueryBuilder over a trivial entity and inspect the generated SQL + parameters WITHOUT touching a
 * database — proving the predicate the helper injects, including the hard rule that always-private
 * resources (memory) can never take the sharing branch even when sharing is unlocked.
 */

const OWNER: AgentVisibilityContext = { platformId: 'plat_1', userId: 'user_1', sharingUnlocked: false }
const OWNER_UNLOCKED: AgentVisibilityContext = { platformId: 'plat_1', userId: 'user_1', sharingUnlocked: true }

let ds: DataSource

// A stand-in entity carrying the scoped columns; unconnected DataSource is enough to build SQL.
const Scoped = new (require('typeorm').EntitySchema)({
    name: 'scoped_probe',
    columns: {
        id: { type: String, primary: true },
        platformId: { type: String },
        userId: { type: String },
    },
})

beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', entities: [Scoped], synchronize: false })
    // buildMetadatas without connecting so createQueryBuilder can emit SQL offline.
    await ds.buildMetadatas()
})

function sqlFor(resourceType: any, ctx: AgentVisibilityContext): { sql: string, params: Record<string, unknown> } {
    const qb = ds.createQueryBuilder(Scoped, 'r')
    agentScope.applyRead(qb, resourceType, ctx, { alias: 'r' })
    return { sql: qb.getQuery(), params: qb.getParameters() }
}

describe('agentScope.applyRead — visibility predicate', () => {
    it('owner-only when the resource is not sharable', () => {
        const { sql, params } = sqlFor(AgentAlwaysPrivateResourceType.MEMORY_FACT, OWNER_UNLOCKED)
        expect(sql).toContain('"platformId" = :ib_scope_platformId')
        expect(sql).toContain('"userId" = :ib_scope_userId')
        // The sharing EXISTS subquery must NEVER appear for memory, even though sharing is unlocked.
        expect(sql).not.toContain('agentSharingOptIn')
        expect(params.ib_scope_platformId).toBe('plat_1')
        expect(params.ib_scope_userId).toBe('user_1')
    })

    it('owner-only for a sharable resource when sharing is NOT unlocked', () => {
        const { sql } = sqlFor(AgentSharableResourceType.ROUTINE, OWNER)
        expect(sql).toContain('"userId" = :ib_scope_userId')
        expect(sql).not.toContain('agentSharingOptIn')
    })

    it('adds the sharing branch ONLY for a sharable resource when sharing is unlocked', () => {
        const { sql } = sqlFor(AgentSharableResourceType.ROUTINE, OWNER_UNLOCKED)
        expect(sql).toContain('"userId" = :ib_scope_userId')
        // sharing branch: owner opt-in EXISTS against user
        expect(sql).toContain('agentSharingOptIn')
        expect(sql).toContain('ib_owner')
        // tenant boundary is still present and mandatory
        expect(sql).toContain('"platformId" = :ib_scope_platformId')
    })

    it('every always-private resource type stays owner-only under unlock', () => {
        for (const t of Object.values(AgentAlwaysPrivateResourceType)) {
            const { sql } = sqlFor(t, OWNER_UNLOCKED)
            expect(sql, `type ${t} must not share`).not.toContain('agentSharingOptIn')
        }
    })
})

describe('agentScope.isOwned / ownerFilter', () => {
    it('ownerFilter returns exactly platformId + userId (never grants sharing)', () => {
        expect(agentScope.ownerFilter(OWNER)).toEqual({ platformId: 'plat_1', userId: 'user_1' })
    })

    it('isOwned is true only for a same-platform same-user row', () => {
        expect(agentScope.isOwned({ platformId: 'plat_1', userId: 'user_1' }, OWNER)).toBe(true)
        expect(agentScope.isOwned({ platformId: 'plat_1', userId: 'user_2' }, OWNER)).toBe(false)
        expect(agentScope.isOwned({ platformId: 'plat_2', userId: 'user_1' }, OWNER)).toBe(false)
        expect(agentScope.isOwned(null, OWNER)).toBe(false)
        expect(agentScope.isOwned(undefined, OWNER)).toBe(false)
    })
})

describe('agentScope.platformFilter — the sanctioned admin/tenant read', () => {
    it('returns ONLY platformId — never a userId (so it spans all users on the tenant)', () => {
        const f = agentScope.platformFilter({ platformId: 'plat_1' })
        expect(f).toEqual({ platformId: 'plat_1' })
        expect('userId' in f).toBe(false)
    })

    it('is still tenant-BOUNDED — a different platform yields a different filter (no cross-tenant reach)', () => {
        // Two tenants produce two distinct, non-overlapping filters. There is no code path here that
        // returns rows for a platform other than the one passed in — cross-tenant is impossible via
        // this helper (that is the operator tier's separate, key-gated concern).
        expect(agentScope.platformFilter({ platformId: 'plat_1' })).not.toEqual(
            agentScope.platformFilter({ platformId: 'plat_2' }),
        )
    })

    it('ignores any userId carried on the context (platform scope must not silently narrow to an owner)', () => {
        // Even if a caller passes a full owner context, platformFilter drops the userId — an admin
        // aggregate must see the whole tenant, not just the admin's own rows.
        expect(agentScope.platformFilter(OWNER)).toEqual({ platformId: 'plat_1' })
    })
})

describe('isAgentResourceSharable — the closed sharable set', () => {
    it('memory + schedule + file are never sharable', () => {
        expect(isAgentResourceSharable(AgentAlwaysPrivateResourceType.MEMORY_FACT)).toBe(false)
        expect(isAgentResourceSharable(AgentAlwaysPrivateResourceType.MEMORY_ENTITY)).toBe(false)
        expect(isAgentResourceSharable(AgentAlwaysPrivateResourceType.MEMORY_RELATION)).toBe(false)
        expect(isAgentResourceSharable(AgentAlwaysPrivateResourceType.SCHEDULE)).toBe(false)
        expect(isAgentResourceSharable(AgentAlwaysPrivateResourceType.FILE)).toBe(false)
    })
    it('routine + conversation + run are sharable', () => {
        expect(isAgentResourceSharable(AgentSharableResourceType.ROUTINE)).toBe(true)
        expect(isAgentResourceSharable(AgentSharableResourceType.CONVERSATION)).toBe(true)
        expect(isAgentResourceSharable(AgentSharableResourceType.RUN)).toBe(true)
    })
})
