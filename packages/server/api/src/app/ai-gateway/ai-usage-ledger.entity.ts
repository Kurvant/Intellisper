// AI Gateway — the ledger. ONE ROW PER AI CALL, across every plane (browser agent, Studio chat,
// flow blocks). This is the sole platform-owned record of what AI actually costs us and what we
// charged for it; before it existed, spend was a read-through of OpenRouter's key ledger, so every
// direct-vendor call (Anthropic, OpenAI, Bedrock, Azure, Gemini) was real money that appeared nowhere.
//
// Design notes that matter for correctness:
//
//   RAW TOKENS ARE STORED SEPARATELY FROM MONEY. The token columns are the primary record; costUsd is
//   derived from them. That is what makes a window RE-COSTABLE if a vendor changes rates or we find a
//   bad entry in the price table — the facts survive the arithmetic.
//
//   idempotencyKey IS UNIQUE. Every transport that feeds this table is at-least-once (a retried worker
//   job, a re-delivered RPC, a resumed engine step), so the same call CAN arrive twice. The unique
//   index turns the second write into a no-op. Double-counted spend is exactly the class of
//   misleading report that gets expensive, so it is enforced by the database, not by discipline.
//
//   NO SECRET MATERIAL. provider/model are names; there are no keys, prompts, or completions here.
import { AiCostSource, AiFeature, AiKeyMode, AiModality, Platform, Project } from '@intelblocks/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, IbIdSchema } from '../database/database-common'

export type AiUsageLedger = {
    id: string
    created: string
    updated: string

    // --- attribution: who spent it, and on what ---
    /** Tenant. ALWAYS present and ALWAYS filtered on — every read of this table is platform-scoped. */
    platformId: string
    projectId: string | null
    userId: string | null
    /** Which product surface spent the money (browser_agent | studio_chat | flow_block | platform). */
    feature: AiFeature
    /** The unit of work: runId / conversationId / flowRunId. Lets us cost a single run end to end. */
    featureRef: string | null

    // --- what was called ---
    provider: string
    model: string
    modality: AiModality
    /** managed = billed to the customer's credit pool; direct = billed to OUR card; byok = their key. */
    keyMode: AiKeyMode

    // --- raw truth (never derived; the basis for any re-costing) ---
    /** FRESH input tokens only — excludes cache reads AND cache writes. See shared/ai-gateway. */
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningTokens: number

    // --- money (derived) ---
    /** What WE pay: COGS, in USD. NUMERIC(14,8) — see the migration for why 8 decimals, not 6. */
    costUsd: string
    /** provider = the vendor billed us this exactly | computed = our price table | unpriced = unknown. */
    costSource: AiCostSource
    /** The price-table version used. NULL when costSource=provider (no table was consulted). */
    priceVersion: string | null
    /** What the CUSTOMER was charged, in credits (1000 = $1). Revenue, against costUsd's COGS. */
    billedCredits: number

    // --- integrity / tracing ---
    /** The vendor's request id — the thread back to their logs when a charge is disputed. */
    requestId: string | null
    /** UNIQUE. The anti-double-count guarantee. */
    idempotencyKey: string
    metadata: Record<string, unknown> | null
}

type AiUsageLedgerSchema = AiUsageLedger & {
    platform: Platform
    project: Project
}

export const AiUsageLedgerEntity = new EntitySchema<AiUsageLedgerSchema>({
    name: 'ai_usage_ledger',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...IbIdSchema,
            nullable: false,
        },
        projectId: {
            ...IbIdSchema,
            nullable: true,
        },
        userId: {
            ...IbIdSchema,
            nullable: true,
        },
        feature: {
            type: String,
            nullable: false,
        },
        featureRef: {
            type: String,
            nullable: true,
        },
        provider: {
            type: String,
            nullable: false,
        },
        model: {
            type: String,
            nullable: false,
        },
        modality: {
            type: String,
            nullable: false,
        },
        keyMode: {
            type: String,
            nullable: false,
        },
        inputTokens: {
            type: Number,
            nullable: false,
            default: 0,
        },
        outputTokens: {
            type: Number,
            nullable: false,
            default: 0,
        },
        cacheReadTokens: {
            type: Number,
            nullable: false,
            default: 0,
        },
        cacheWriteTokens: {
            type: Number,
            nullable: false,
            default: 0,
        },
        reasoningTokens: {
            type: Number,
            nullable: false,
            default: 0,
        },
        costUsd: {
            // NUMERIC, not float: money must not drift. Mapped to string in JS because a JS number
            // cannot hold 8 decimal places of a large SUM without losing pennies at scale.
            type: 'numeric',
            precision: 14,
            scale: 8,
            nullable: false,
            default: 0,
        },
        costSource: {
            type: String,
            nullable: false,
        },
        priceVersion: {
            type: String,
            nullable: true,
        },
        billedCredits: {
            type: Number,
            nullable: false,
            default: 0,
        },
        requestId: {
            type: String,
            nullable: true,
        },
        idempotencyKey: {
            type: String,
            nullable: false,
        },
        metadata: {
            type: 'jsonb',
            nullable: true,
        },
    },
    indices: [
        {
            // THE anti-double-count guarantee. A re-delivered report hits this and becomes a no-op.
            name: 'idx_ai_usage_ledger_idempotency',
            columns: ['idempotencyKey'],
            unique: true,
        },
        {
            // The tenant-scoped time-window scan every dashboard read performs.
            name: 'idx_ai_usage_ledger_platform_created',
            columns: ['platformId', 'created'],
            unique: false,
        },
        {
            // "What is this customer's spend by product surface?" — the core business question.
            name: 'idx_ai_usage_ledger_platform_feature_created',
            columns: ['platformId', 'feature', 'created'],
            unique: false,
        },
        {
            // Retention prune scans by time alone, across all tenants.
            name: 'idx_ai_usage_ledger_created',
            columns: ['created'],
            unique: false,
        },
    ],
    relations: {
        platform: {
            type: 'many-to-one',
            target: 'platform',
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_ai_usage_ledger_platform_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            nullable: true,
            // SET NULL, not CASCADE: deleting a project must NOT erase the money we already spent on
            // it. The cost is a historical fact and has to survive its subject.
            onDelete: 'SET NULL',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_ai_usage_ledger_project_id',
            },
        },
    },
})
