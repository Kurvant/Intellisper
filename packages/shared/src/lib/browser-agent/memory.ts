import { z } from 'zod'
import { BaseModelSchema, Nullable } from '../core/common/base-model'

/**
 * Memory scope discriminator — WHO a fact belongs to. One store, three audiences:
 *
 *  - USER     : Intellisper Agent. Personal to the owning user. Readable by that user alone; an
 *               admin may only ever see it under the three-condition gate below, and only for facts
 *               the user explicitly marked SHARED.
 *  - PLATFORM : Intellisper Studio "org memory". Team knowledge for the whole platform — read by
 *               flow agent steps / copilot / MCP, curated by members, governed by the admin.
 *  - FLOW     : Studio per-flow memory. Facts a specific flow accumulates across its runs
 *               (`flowId` set). Written by that flow's AI Agent steps, curated in Studio.
 *
 * A USER fact is NEVER visible to another member. PLATFORM/FLOW facts are org-owned by design.
 */
export const AgentMemoryScope = {
    USER: 'USER',
    PLATFORM: 'PLATFORM',
    FLOW: 'FLOW',
} as const
export type AgentMemoryScope = (typeof AgentMemoryScope)[keyof typeof AgentMemoryScope]

/**
 * Per-fact sharing mark — the INNERMOST of the three conditions guarding admin visibility.
 *
 *  - PRIVATE : permanently private. NEVER visible to a platform admin, even when the owner has
 *              opted in to admin visibility. This is the user's absolute veto.
 *  - SHARED  : the owner has marked this specific fact as shareable with their platform admin.
 *              It becomes visible ONLY while the other two conditions also hold.
 *
 * THE GATE (all three must be true, enforced in SQL — see the memory service's admin read):
 *   1. platform_plan.agentSharingUnlocked  — the admin enabled the capability for the platform
 *   2. user.agentSharingOptIn              — the owner opted in to admin visibility
 *   3. memory_fact.visibility = SHARED     — the owner marked THIS fact shareable
 * Any one false ⇒ the fact is invisible. Revoking the opt-in hides every fact instantly without
 * disturbing the per-fact marks, so re-opting-in restores exactly the previous selection.
 */
export const MemoryVisibility = {
    PRIVATE: 'PRIVATE',
    SHARED: 'SHARED',
} as const
export type MemoryVisibility = (typeof MemoryVisibility)[keyof typeof MemoryVisibility]

export const MemoryFactKind = {
    PREFERENCE: 'PREFERENCE',
    PROJECT: 'PROJECT',
    TASK: 'TASK',
    CONTACT: 'CONTACT',
    NOTE: 'NOTE',
} as const
export type MemoryFactKind = (typeof MemoryFactKind)[keyof typeof MemoryFactKind]

export const MemoryFactSource = {
    EXPLICIT: 'EXPLICIT',
    AUTO: 'AUTO',
} as const
export type MemoryFactSource = (typeof MemoryFactSource)[keyof typeof MemoryFactSource]

export const MemoryFact = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    /** The owning user for USER facts; the author for PLATFORM/FLOW facts (org-owned). */
    userId: z.string(),
    scope: z.enum([AgentMemoryScope.USER, AgentMemoryScope.PLATFORM, AgentMemoryScope.FLOW]),
    /** Set only for FLOW-scoped facts — the flow whose runs accumulate this memory. */
    flowId: Nullable(z.string()),
    /** Per-fact admin-visibility mark. Only meaningful for USER facts; see MemoryVisibility. */
    visibility: z.enum([MemoryVisibility.PRIVATE, MemoryVisibility.SHARED]),
    kind: z.enum([
        MemoryFactKind.PREFERENCE,
        MemoryFactKind.PROJECT,
        MemoryFactKind.TASK,
        MemoryFactKind.CONTACT,
        MemoryFactKind.NOTE,
    ]),
    content: z.string(),
    source: z.enum([MemoryFactSource.EXPLICIT, MemoryFactSource.AUTO]),
    /** Name of the embedding model that produced this row's vector (dimension guard). */
    embeddingModel: Nullable(z.string()),
    deletedAt: Nullable(z.string()),
    // NOTE: the pgvector `embedding vector(N)` column is intentionally NOT modelled here —
    // TypeORM has no vector type; all vector I/O is raw parameterised SQL in the memory service.
})
export type MemoryFact = z.infer<typeof MemoryFact>

export const MemoryEntityType = {
    PERSON: 'PERSON',
    COMPANY: 'COMPANY',
    DEAL: 'DEAL',
    DOCUMENT: 'DOCUMENT',
} as const
export type MemoryEntityType = (typeof MemoryEntityType)[keyof typeof MemoryEntityType]

export const MemoryEntity = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    userId: z.string(),
    type: z.enum([
        MemoryEntityType.PERSON,
        MemoryEntityType.COMPANY,
        MemoryEntityType.DEAL,
        MemoryEntityType.DOCUMENT,
    ]),
    name: z.string(),
    attributes: Nullable(z.record(z.string(), z.unknown())),
    deletedAt: Nullable(z.string()),
})
export type MemoryEntity = z.infer<typeof MemoryEntity>

export const MemoryRelation = z.object({
    ...BaseModelSchema,
    platformId: z.string(),
    userId: z.string(),
    fromEntityId: z.string(),
    toEntityId: z.string(),
    relation: z.string(),
})
export type MemoryRelation = z.infer<typeof MemoryRelation>
