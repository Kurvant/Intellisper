import {
    AgentMemoryScope,
    AiFeature,
    ErrorCode,
    ibId,
    IntellisperError,
    MemoryFactKind,
    MemoryFactSource,
    MemoryVisibility,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../../database/database-connection'
import { BROWSER_AGENT_EMBEDDING_DIMENSIONS } from '../model-provider/model-provider.config'
import { browserAgentModelProvider } from '../model-provider/model-provider.service'
import type { AgentLedgerContext } from '../model-provider/model-provider.types'

/**
 * Browser-agent memory over pgvector. Durable facts ABOUT THE USER (preferences/projects/people/
 * tasks), NOT a conversation log. Mirrors blockunits' Knowledge-Base vector I/O (raw parameterised
 * SQL, `[..]::vector`, `<=>` cosine) since the `embedding` column is unmapped in TypeORM.
 *
 * HARD RULES:
 *  - ALWAYS user-private. Every read/write is scoped by (platformId, userId). A USER-scoped fact is
 *    never visible to another user — no sharing branch exists here at all (see scope.ts always-private).
 *  - Secret guard: refuses credential-like content (returns refused, not an error).
 *  - Dedupe: a near-identical existing fact is UPDATED in place rather than duplicated.
 *  - Graceful degradation: when pgvector is absent, memory ops no-op cleanly so the app still boots.
 */
const DEDUPE_DISTANCE = 0.08
const MAX_RECALL_DISTANCE = 0.55
const RECALL_K_BY_TIER: Record<string, number> = { free: 3, pro: 5, enterprise: 8 }
const SECRET_HINT = /(password|passcode|api[_-]?key|secret|token|ssn|social security|credit\s?card|card\s?number|cvv|cvc|\bpin\b|private key|seed phrase|mnemonic)/i
const LONG_NUMBER = /\d[\d\s-]{11,}/ // 12+ digit run (card/account numbers)

let vectorAvailable: boolean | null = null

async function isVectorAvailable(): Promise<boolean> {
    if (vectorAvailable !== null) return vectorAvailable
    try {
        const rows = await databaseConnection().query('SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = \'vector\') AS installed')
        vectorAvailable = rows[0]?.installed === true
    }
    catch {
        vectorAvailable = false
    }
    return vectorAvailable
}

function isSecretLike(content: string): boolean {
    return SECRET_HINT.test(content) || LONG_NUMBER.test(content)
}

function toVectorLiteral(embedding: number[]): string {
    if (embedding.length !== BROWSER_AGENT_EMBEDDING_DIMENSIONS) {
        throw new Error(`Embedding dimension mismatch: expected ${BROWSER_AGENT_EMBEDDING_DIMENSIONS}, got ${embedding.length}`)
    }
    for (const n of embedding) {
        if (!Number.isFinite(n)) throw new Error('Embedding contains a non-finite value')
    }
    return `[${embedding.join(',')}]`
}

export type MemoryScope = { userId: string, platformId: string }

/**
 * Which memory a request addresses, and (for FLOW) which flow. USER facts are owner-scoped;
 * PLATFORM/FLOW facts are org-owned — any member of the platform may read and curate them.
 */
export type MemoryTarget = { scope: AgentMemoryScope, flowId?: string | null }

/**
 * The SQL predicate + args selecting the rows a given target addresses, for the acting user.
 *
 *  - USER     → owner-only: (platformId, userId). Another member can never match this.
 *  - PLATFORM → org-wide: (platformId, scope='PLATFORM'). Deliberately NOT filtered by userId —
 *               org memory belongs to the platform, not to whoever happened to write it.
 *  - FLOW     → org-wide within one flow: (platformId, scope='FLOW', flowId).
 *
 * Returns the WHERE fragment (already including the deletedAt guard) plus its positional args,
 * starting at $1. Callers append their own params after `args.length`.
 */
function targetPredicate(scope: MemoryScope, target: MemoryTarget): { where: string, args: unknown[] } {
    switch (target.scope) {
        case AgentMemoryScope.PLATFORM:
            return {
                where: '"platformId" = $1 AND "scope" = \'PLATFORM\' AND "deletedAt" IS NULL',
                args: [scope.platformId],
            }
        case AgentMemoryScope.FLOW:
            return {
                where: '"platformId" = $1 AND "scope" = \'FLOW\' AND "flowId" = $2 AND "deletedAt" IS NULL',
                args: [scope.platformId, target.flowId ?? ''],
            }
        case AgentMemoryScope.USER:
        default:
            return {
                where: '"platformId" = $1 AND "userId" = $2 AND "scope" = \'USER\' AND "deletedAt" IS NULL',
                args: [scope.platformId, scope.userId],
            }
    }
}

function assertFlowTarget(target: MemoryTarget): void {
    if (target.scope === AgentMemoryScope.FLOW && !target.flowId) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: 'flowId is required for flow-scoped memory.' },
        })
    }
}

/**
 * AI Gateway attribution for memory embeddings. Booked to PLATFORM, not BROWSER_AGENT: this is
 * internal machinery (indexing and recall), not a user-facing agent turn, and blending it into the
 * agent's line would overstate what the agent itself costs.
 *
 * The idempotency prefix is per (user, operation, minute). Embeddings carry no natural request id, and
 * a minute bucket is granular enough to keep distinct work distinct while making an immediate retry of
 * the SAME operation collapse into one row rather than double-billing it.
 */
function embedLedger(scope: MemoryScope, op: 'remember' | 'recall'): AgentLedgerContext {
    const minute = Math.floor(Date.now() / 60_000)
    return {
        userId: scope.userId,
        feature: AiFeature.PLATFORM,
        featureRef: `memory:${op}`,
        idempotencyPrefix: `mem:${scope.userId}:${op}:${minute}`,
    }
}

export const browserAgentMemory = (log: FastifyBaseLogger) => ({
    /**
     * Remember a fact. Secret-guarded, embedded, and deduped: a near-identical existing fact is
     * updated in place; otherwise a new row is inserted. Returns `{saved, refused?}` — a refused
     * secret is a friendly non-error the tool relays as-is.
     */
    async remember(scope: MemoryScope, content: string, kind: MemoryFactKind, source: MemoryFactSource, memoryScope: AgentMemoryScope = AgentMemoryScope.USER, flowId?: string | null): Promise<{ saved: boolean, refused?: boolean, id?: string }> {
        const target: MemoryTarget = { scope: memoryScope, flowId }
        assertFlowTarget(target)
        const trimmed = content.trim()
        if (!trimmed) return { saved: false }
        if (isSecretLike(trimmed)) {
            log.info({ userId: scope.userId }, '[browserAgentMemory] refused secret-like content')
            return { saved: false, refused: true }
        }
        if (!(await isVectorAvailable())) return { saved: false }

        const embeddingModel = 'text-embedding-3-small'
        // Metered: embeddings run in BULK (every remembered fact, every recall), so they are a real
        // line item that was previously invisible — an env key with no accounting at all.
        const embedding = await browserAgentModelProvider(log, scope.platformId, embedLedger(scope, 'remember')).embed(trimmed)
        const literal = toVectorLiteral(embedding)

        // Dedupe WITHIN THE TARGET SCOPE only. Scoping this to the target (rather than to the user
        // across all scopes) is a privacy requirement, not an optimisation: deduping across scopes
        // could fold a personal fact into an org-visible row — silently widening its audience — or
        // rewrite one flow's memory from another's.
        const { where, args } = targetPredicate(scope, target)
        const near = await databaseConnection().query(
            `SELECT id, (embedding <=> $${args.length + 1}::vector) AS distance
             FROM browser_agent_memory_fact
             WHERE ${where} AND embedding IS NOT NULL
             ORDER BY distance LIMIT 1`,
            [...args, literal],
        )
        const nearest = near[0]
        if (nearest && Number(nearest.distance) <= DEDUPE_DISTANCE) {
            // Update by id AND the same scope predicate — never widen the row's reach on merge.
            await databaseConnection().query(
                `UPDATE browser_agent_memory_fact
                 SET content = $${args.length + 1}, kind = $${args.length + 2}, source = $${args.length + 3},
                     embedding = $${args.length + 4}::vector, "embeddingModel" = $${args.length + 5}, updated = now()
                 WHERE ${where} AND id = $${args.length + 6}`,
                [...args, trimmed, kind, source, literal, embeddingModel, nearest.id],
            )
            return { saved: true, id: nearest.id }
        }

        const id = ibId()
        // visibility is NOT set here — it defaults to PRIVATE in the schema. Every fact is born
        // private; sharing is only ever a later, deliberate act by the owner.
        await databaseConnection().query(
            `INSERT INTO browser_agent_memory_fact (id, created, updated, "platformId", "userId", scope, "flowId", kind, content, source, "embeddingModel", embedding)
             VALUES ($1, now(), now(), $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)`,
            [id, scope.platformId, scope.userId, memoryScope, target.flowId ?? null, kind, trimmed, source, embeddingModel, literal],
        )
        return { saved: true, id }
    },

    /**
     * Recall the top-K facts most relevant to a query for THIS user (cosine, distance-capped).
     * Returns [] when pgvector is absent (graceful degradation). Strictly user-scoped.
     */
    async recall(scope: MemoryScope, query: string, k: number, target: MemoryTarget = { scope: AgentMemoryScope.USER }): Promise<Array<{ id: string, content: string, kind: string, relevance: number }>> {
        assertFlowTarget(target)
        if (!query.trim() || !(await isVectorAvailable())) return []
        const embedding = await browserAgentModelProvider(log, scope.platformId, embedLedger(scope, 'recall')).embed(query)
        const literal = toVectorLiteral(embedding)
        const limit = Math.max(1, Math.min(25, k))
        const { where, args } = targetPredicate(scope, target)
        const p = args.length
        const rows = await databaseConnection().query(
            `SELECT id, content, kind, (embedding <=> $${p + 1}::vector) AS distance
             FROM browser_agent_memory_fact
             WHERE ${where} AND embedding IS NOT NULL
               AND (embedding <=> $${p + 1}::vector) <= $${p + 2}
             ORDER BY distance LIMIT $${p + 3}`,
            [...args, literal, MAX_RECALL_DISTANCE, limit],
        )
        return rows.map((r: { id: string, content: string, kind: string, distance: number }) => ({
            id: r.id, content: r.content, kind: r.kind, relevance: Math.max(0, 1 - Number(r.distance) / 2),
        }))
    },

    /** Soft-delete a fact — strictly scoped to the owner. */
    async forget(scope: MemoryScope, factId: string): Promise<{ ok: boolean }> {
        const res = await databaseConnection().query(
            `UPDATE browser_agent_memory_fact SET "deletedAt" = now()
             WHERE id = $1 AND "platformId" = $2 AND "userId" = $3 AND "deletedAt" IS NULL`,
            [factId, scope.platformId, scope.userId],
        )
        // pg returns [rows, affected] for UPDATE via query()
        const affected = Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0
        return { ok: affected > 0 }
    },

    /**
     * List facts (paginated, ILIKE search, optional kind filter) within a target scope. Does not
     * need pgvector — the memory page must still work when the extension is absent.
     *
     * The target predicate is what keeps this safe: USER lists only the caller's own facts, and
     * there is no parameter that lets a caller list another member's USER memory.
     */
    async listFacts(scope: MemoryScope, params: { target?: MemoryTarget, search?: string, kind?: MemoryFactKind, page?: number, limit?: number }): Promise<{ facts: Array<{ id: string, content: string, kind: string, source: string, scope: string, flowId: string | null, visibility: string, created: string }>, total: number }> {
        const target = params.target ?? { scope: AgentMemoryScope.USER }
        assertFlowTarget(target)
        const page = Math.max(1, params.page ?? 1)
        const limit = Math.max(1, Math.min(100, params.limit ?? 20))
        const offset = (page - 1) * limit

        const { where, args } = targetPredicate(scope, target)
        let filters = ''
        const search = params.search?.trim()
        if (search) {
            args.push(`%${search}%`)
            filters += ` AND content ILIKE $${args.length}`
        }
        if (params.kind) {
            args.push(params.kind)
            filters += ` AND kind = $${args.length}`
        }

        const countRows = await databaseConnection().query(
            `SELECT COUNT(*)::int AS total FROM browser_agent_memory_fact WHERE ${where} ${filters}`,
            args,
        )
        args.push(limit)
        const rows = await databaseConnection().query(
            `SELECT id, content, kind, source, scope, "flowId", visibility, created
             FROM browser_agent_memory_fact
             WHERE ${where} ${filters}
             ORDER BY created DESC LIMIT $${args.length} OFFSET ${offset}`,
            args,
        )
        return { facts: rows, total: countRows[0]?.total ?? 0 }
    },

    /**
     * Create a fact by hand (the UI's "Add memory"). Same secret-guard and dedupe as an
     * agent-written fact — a user typing a token into the memory box is exactly the case the guard
     * exists for. Always born PRIVATE: sharing is a separate, deliberate act.
     */
    async createFact(scope: MemoryScope, params: { content: string, kind?: MemoryFactKind, target?: MemoryTarget }): Promise<{ saved: boolean, refused?: boolean, id?: string }> {
        const target = params.target ?? { scope: AgentMemoryScope.USER }
        assertFlowTarget(target)
        return this.remember(
            scope,
            params.content,
            params.kind ?? MemoryFactKind.NOTE,
            MemoryFactSource.EXPLICIT,
            target.scope,
            target.flowId,
        )
    },

    /**
     * Edit a fact in place. Re-embeds when the content actually changes (a stale vector would make
     * the row unrecallable). Write access follows the target predicate: own USER facts, or any
     * org-owned PLATFORM/FLOW fact in the caller's platform.
     */
    async updateFact(scope: MemoryScope, factId: string, params: { content?: string, kind?: MemoryFactKind }): Promise<{ ok: boolean, refused?: boolean }> {
        const existing = await databaseConnection().query(
            `SELECT id, scope, "userId", content FROM browser_agent_memory_fact
             WHERE id = $1 AND "platformId" = $2 AND "deletedAt" IS NULL`,
            [factId, scope.platformId],
        )
        const row = existing[0]
        if (!row) return { ok: false }
        // A USER fact is only ever writable by its owner — never by another member of the platform.
        if (row.scope === AgentMemoryScope.USER && row.userId !== scope.userId) return { ok: false }

        const content = params.content?.trim()
        if (content && isSecretLike(content)) {
            log.info({ userId: scope.userId }, '[browserAgentMemory] refused secret-like content on update')
            return { ok: false, refused: true }
        }

        const contentChanged = !!content && content !== row.content
        // Re-embed only on a real content change; kind-only edits keep the existing vector.
        const literal = contentChanged && (await isVectorAvailable())
            ? toVectorLiteral(await browserAgentModelProvider(log, scope.platformId, embedLedger(scope, 'remember')).embed(content))
            : null

        await databaseConnection().query(
            `UPDATE browser_agent_memory_fact
             SET content = COALESCE($1, content),
                 kind = COALESCE($2, kind),
                 embedding = COALESCE($3::vector, embedding),
                 updated = now()
             WHERE id = $4 AND "platformId" = $5`,
            [content ?? null, params.kind ?? null, literal, factId, scope.platformId],
        )
        return { ok: true }
    },

    /**
     * Set a fact's admin-visibility mark. Deliberately narrow:
     *  - only the OWNER of the fact may change it (never an admin, never another member), and
     *  - only USER facts have a meaningful mark (PLATFORM/FLOW facts are org-owned already).
     * Marking SHARED does not by itself expose anything — the platform unlock and the owner's
     * opt-in must also hold. Returning to PRIVATE is an instant, unconditional veto.
     */
    async setVisibility(scope: MemoryScope, factId: string, visibility: MemoryVisibility): Promise<{ ok: boolean }> {
        const res = await databaseConnection().query(
            `UPDATE browser_agent_memory_fact SET visibility = $1, updated = now()
             WHERE id = $2 AND "platformId" = $3 AND "userId" = $4 AND scope = 'USER' AND "deletedAt" IS NULL`,
            [visibility, factId, scope.platformId, scope.userId],
        )
        const affected = Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0
        return { ok: affected > 0 }
    },

    /**
     * Forget everything in a scope (the "clear my memory" / GDPR path). Soft-delete, so an
     * accidental wipe stays recoverable by an operator. Returns how many rows it hid.
     */
    async bulkDelete(scope: MemoryScope, target: MemoryTarget): Promise<{ deleted: number }> {
        assertFlowTarget(target)
        const { where, args } = targetPredicate(scope, target)
        const res = await databaseConnection().query(
            `UPDATE browser_agent_memory_fact SET "deletedAt" = now() WHERE ${where}`,
            args,
        )
        const affected = Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0
        return { deleted: affected }
    },

    /** Export a scope's facts (data-portability). Unpaginated by design — it is a download. */
    async exportFacts(scope: MemoryScope, target: MemoryTarget): Promise<Array<{ id: string, content: string, kind: string, source: string, scope: string, flowId: string | null, visibility: string, created: string }>> {
        assertFlowTarget(target)
        const { where, args } = targetPredicate(scope, target)
        return databaseConnection().query(
            `SELECT id, content, kind, source, scope, "flowId", visibility, created
             FROM browser_agent_memory_fact WHERE ${where} ORDER BY created DESC`,
            args,
        )
    },

    /**
     * THE ADMIN READ — the only path in the system that returns memory across owners.
     *
     * Everything an admin can see is one of:
     *   (a) org-owned memory: scope IN ('PLATFORM','FLOW') — team knowledge, admin-governed by design; or
     *   (b) a USER fact that satisfies ALL THREE conditions simultaneously:
     *         1. platform_plan."agentSharingUnlocked" = true   (admin enabled the capability)
     *         2. u."agentSharingOptIn"                = true   (the owner opted in)
     *         3. f.visibility                         = 'SHARED' (the owner marked THIS fact)
     *
     * The three conditions are ANDed inside ONE predicate that no caller can weaken — there is no
     * parameter here that relaxes it, and no sibling method that reads USER facts across owners.
     * A fact left PRIVATE is unreachable through this query no matter what the outer switches say,
     * which is the user's absolute veto. Because (1) and (2) are joined live rather than
     * denormalised, revoking either switch hides the facts on the very next read.
     */
    async adminListFacts(platformId: string, params: { scope?: AgentMemoryScope, search?: string, page?: number, limit?: number }): Promise<{ facts: Array<{ id: string, content: string, kind: string, source: string, scope: string, flowId: string | null, visibility: string, created: string, ownerEmail: string | null }>, total: number }> {
        const page = Math.max(1, params.page ?? 1)
        const limit = Math.max(1, Math.min(100, params.limit ?? 20))
        const offset = (page - 1) * limit

        // The gate. Note the parenthesisation: org-owned OR (user-fact AND all-three-conditions).
        const VISIBLE_TO_ADMIN = `
            f."platformId" = $1
            AND f."deletedAt" IS NULL
            AND (
                f.scope IN ('PLATFORM', 'FLOW')
                OR (
                    f.scope = 'USER'
                    AND f.visibility = 'SHARED'
                    AND u."agentSharingOptIn" = true
                    AND pp."agentSharingUnlocked" = true
                )
            )`
        // `user` carries no email — it lives on `user_identity` (identity/user split). The join is
        // LEFT on a primary key, so it can neither drop nor duplicate a fact row, and it is part of
        // the shared FROM so the count and the page always agree.
        const FROM = `
            FROM browser_agent_memory_fact f
            LEFT JOIN "user" u ON u.id = f."userId"
            LEFT JOIN user_identity ui ON ui.id = u."identityId"
            LEFT JOIN platform_plan pp ON pp."platformId" = f."platformId"`

        const args: unknown[] = [platformId]
        let filters = ''
        if (params.scope) {
            args.push(params.scope)
            filters += ` AND f.scope = $${args.length}`
        }
        const search = params.search?.trim()
        if (search) {
            args.push(`%${search}%`)
            filters += ` AND f.content ILIKE $${args.length}`
        }

        const countRows = await databaseConnection().query(
            `SELECT COUNT(*)::int AS total ${FROM} WHERE ${VISIBLE_TO_ADMIN} ${filters}`,
            args,
        )
        args.push(limit)
        const rows = await databaseConnection().query(
            `SELECT f.id, f.content, f.kind, f.source, f.scope, f."flowId", f.visibility, f.created,
                    ui.email AS "ownerEmail"
             ${FROM} WHERE ${VISIBLE_TO_ADMIN} ${filters}
             ORDER BY f.created DESC LIMIT $${args.length} OFFSET ${offset}`,
            args,
        )
        return { facts: rows, total: countRows[0]?.total ?? 0 }
    },

    /**
     * Admin governance summary. `sharedUserFactCount` counts only facts passing the full gate, so
     * the number an admin sees always equals what they can actually open — never a teaser for data
     * they cannot reach.
     */
    async adminOverview(platformId: string): Promise<{ sharingUnlocked: boolean, orgFactCount: number, flowFactCount: number, sharedUserFactCount: number, optedInMemberCount: number, memberCount: number }> {
        const rows = await databaseConnection().query(
            `SELECT
                COALESCE((SELECT pp."agentSharingUnlocked" FROM platform_plan pp WHERE pp."platformId" = $1), false) AS "sharingUnlocked",
                (SELECT COUNT(*)::int FROM browser_agent_memory_fact f
                  WHERE f."platformId" = $1 AND f."deletedAt" IS NULL AND f.scope = 'PLATFORM') AS "orgFactCount",
                (SELECT COUNT(*)::int FROM browser_agent_memory_fact f
                  WHERE f."platformId" = $1 AND f."deletedAt" IS NULL AND f.scope = 'FLOW') AS "flowFactCount",
                (SELECT COUNT(*)::int FROM browser_agent_memory_fact f
                  LEFT JOIN "user" u ON u.id = f."userId"
                  LEFT JOIN platform_plan pp ON pp."platformId" = f."platformId"
                  WHERE f."platformId" = $1 AND f."deletedAt" IS NULL AND f.scope = 'USER'
                    AND f.visibility = 'SHARED' AND u."agentSharingOptIn" = true
                    AND pp."agentSharingUnlocked" = true) AS "sharedUserFactCount",
                (SELECT COUNT(*)::int FROM "user" u
                  WHERE u."platformId" = $1 AND u."agentSharingOptIn" = true) AS "optedInMemberCount",
                (SELECT COUNT(*)::int FROM "user" u WHERE u."platformId" = $1) AS "memberCount"`,
            [platformId],
        )
        const r = rows[0] ?? {}
        return {
            sharingUnlocked: r.sharingUnlocked ?? false,
            orgFactCount: r.orgFactCount ?? 0,
            flowFactCount: r.flowFactCount ?? 0,
            sharedUserFactCount: r.sharedUserFactCount ?? 0,
            optedInMemberCount: r.optedInMemberCount ?? 0,
            memberCount: r.memberCount ?? 0,
        }
    },

    /** Recall-K for a tier (used by the runtime's auto-inject). */
    recallKForTier(tier: string): number {
        return RECALL_K_BY_TIER[tier] ?? RECALL_K_BY_TIER.free
    },

    /** Test seam: reset the cached pgvector-availability probe. */
    _resetVectorProbe(): void {
        vectorAvailable = null
    },
})

export { MemoryFactKind, MemoryFactSource }
