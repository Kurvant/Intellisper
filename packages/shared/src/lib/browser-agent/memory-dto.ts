import { z } from 'zod'
import { Nullable } from '../core/common/base-model'
import { AgentMemoryScope, MemoryFactKind, MemoryFactSource, MemoryVisibility } from './memory'

const MemoryKindEnum = z.enum([
    MemoryFactKind.PREFERENCE,
    MemoryFactKind.PROJECT,
    MemoryFactKind.TASK,
    MemoryFactKind.CONTACT,
    MemoryFactKind.NOTE,
])

/** Which memory a request addresses. USER = mine; PLATFORM = org; FLOW = one flow's memory. */
const MemoryScopeEnum = z.enum([AgentMemoryScope.USER, AgentMemoryScope.PLATFORM, AgentMemoryScope.FLOW])

/**
 * List/search facts. `scope` selects the audience (defaults to USER = the caller's own memory).
 * `flowId` is required when scope=FLOW. projectId is required for the project membership check.
 */
export const ListMemoryFactsRequest = z.object({
    projectId: z.string(),
    scope: MemoryScopeEnum.optional(),
    flowId: z.string().optional(),
    search: z.string().optional(),
    kind: MemoryKindEnum.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
})
export type ListMemoryFactsRequest = z.infer<typeof ListMemoryFactsRequest>

export const RecallMemoryRequest = z.object({
    projectId: z.string(),
    q: z.string().min(1),
    scope: MemoryScopeEnum.optional(),
    flowId: z.string().optional(),
    limit: z.coerce.number().int().positive().max(25).optional(),
})
export type RecallMemoryRequest = z.infer<typeof RecallMemoryRequest>

export const DeleteMemoryFactRequest = z.object({
    projectId: z.string(),
})
export type DeleteMemoryFactRequest = z.infer<typeof DeleteMemoryFactRequest>

/** Add a fact by hand. Same secret-guard + dedupe as an agent-written fact. */
export const CreateMemoryFactRequest = z.object({
    projectId: z.string(),
    content: z.string().min(1).max(2000),
    kind: MemoryKindEnum.optional(),
    scope: MemoryScopeEnum.optional(),
    flowId: z.string().optional(),
})
export type CreateMemoryFactRequest = z.infer<typeof CreateMemoryFactRequest>

/** Edit a fact's content/kind in place (re-embeds when the content changes). */
export const UpdateMemoryFactRequest = z.object({
    projectId: z.string(),
    content: z.string().min(1).max(2000).optional(),
    kind: MemoryKindEnum.optional(),
})
export type UpdateMemoryFactRequest = z.infer<typeof UpdateMemoryFactRequest>

/**
 * Mark a single USER fact shareable with the platform admin, or take it back to permanently
 * private. Only ever affects the caller's OWN facts. Marking SHARED does not itself expose the
 * fact — the platform unlock and the user's opt-in must also be on (see MemoryVisibility).
 */
export const SetMemoryFactVisibilityRequest = z.object({
    projectId: z.string(),
    visibility: z.enum([MemoryVisibility.PRIVATE, MemoryVisibility.SHARED]),
})
export type SetMemoryFactVisibilityRequest = z.infer<typeof SetMemoryFactVisibilityRequest>

/** Forget everything in a scope (GDPR-style). Requires an explicit confirmation. */
export const BulkDeleteMemoryRequest = z.object({
    projectId: z.string(),
    scope: MemoryScopeEnum.optional(),
    flowId: z.string().optional(),
})
export type BulkDeleteMemoryRequest = z.infer<typeof BulkDeleteMemoryRequest>

export const MemoryFactView = z.object({
    id: z.string(),
    content: z.string(),
    kind: z.string(),
    source: z.string(),
    scope: z.string(),
    flowId: Nullable(z.string()),
    visibility: z.string(),
    created: z.string(),
})
export type MemoryFactView = z.infer<typeof MemoryFactView>

export const ListMemoryFactsResponse = z.object({
    facts: z.array(MemoryFactView),
    total: z.number(),
})
export type ListMemoryFactsResponse = z.infer<typeof ListMemoryFactsResponse>

export const RecallMemoryResponse = z.object({
    facts: z.array(z.object({
        id: z.string(),
        content: z.string(),
        kind: z.string(),
        relevance: z.number(),
    })),
})
export type RecallMemoryResponse = z.infer<typeof RecallMemoryResponse>

/**
 * The caller's own memory settings. Both switches are the USER's to control:
 *  - autoRecall  : use my memory to personalise answers (governs the runtime's recall injection)
 *  - autoCapture : let the agent save durable facts it learns during a task
 *  - adminVisibilityOptIn : allow my platform admin to see the facts I mark shareable.
 *    `adminVisibilityAvailable` reflects whether the admin unlocked the capability at all — when
 *    false, the opt-in is inert and the UI should say so rather than offer a dead switch.
 */
export const MemorySettingsResponse = z.object({
    autoRecall: z.boolean(),
    autoCapture: z.boolean(),
    adminVisibilityOptIn: z.boolean(),
    adminVisibilityAvailable: z.boolean(),
    sharedFactCount: z.number(),
    /**
     * True when this platform has exactly one member — a solo cloud signup, where "me" and "the org"
     * are the same person and a My-memory/Org-memory split is a distinction without a difference.
     *
     * PRESENTATION ONLY. It changes how the UI is laid out and what scope the Add-memory form
     * DEFAULTS to; it never changes what a stored fact means. A USER fact stays personal on every
     * platform, whatever the headcount — scope is decided once, at write time, and is never
     * reinterpreted later. Keying visibility off a mutable member count would silently widen a
     * fact's audience the moment someone is invited, which is exactly what the privacy model exists
     * to prevent.
     */
    soloPlatform: z.boolean(),
})
export type MemorySettingsResponse = z.infer<typeof MemorySettingsResponse>

export const UpdateMemorySettingsRequest = z.object({
    projectId: z.string(),
    autoRecall: z.boolean().optional(),
    autoCapture: z.boolean().optional(),
    adminVisibilityOptIn: z.boolean().optional(),
})
export type UpdateMemorySettingsRequest = z.infer<typeof UpdateMemorySettingsRequest>

/** Admin: flip the platform-wide capability that lets members opt in at all. */
export const SetMemorySharingUnlockedRequest = z.object({
    unlocked: z.boolean(),
})
export type SetMemorySharingUnlockedRequest = z.infer<typeof SetMemorySharingUnlockedRequest>

/**
 * Admin platform-wide memory view. Returns ONLY:
 *  - PLATFORM (org) and FLOW facts — org-owned by design, and
 *  - USER facts that pass ALL THREE conditions (unlock + owner opt-in + fact marked SHARED).
 * A permanently-private fact can never appear here. `ownerEmail` is included so an admin can see
 * who contributed a shared fact.
 */
export const AdminMemoryFactView = MemoryFactView.extend({
    ownerEmail: Nullable(z.string()),
})
export type AdminMemoryFactView = z.infer<typeof AdminMemoryFactView>

export const ListAdminMemoryRequest = z.object({
    scope: MemoryScopeEnum.optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
})
export type ListAdminMemoryRequest = z.infer<typeof ListAdminMemoryRequest>

export const ListAdminMemoryResponse = z.object({
    facts: z.array(AdminMemoryFactView),
    total: z.number(),
})
export type ListAdminMemoryResponse = z.infer<typeof ListAdminMemoryResponse>

/** Admin governance summary: what exists, and how much of it members chose to share. */
export const AdminMemoryOverviewResponse = z.object({
    sharingUnlocked: z.boolean(),
    orgFactCount: z.number(),
    flowFactCount: z.number(),
    /** USER facts visible to the admin right now (i.e. passing all three conditions). */
    sharedUserFactCount: z.number(),
    /** Members who have opted in to admin visibility. */
    optedInMemberCount: z.number(),
    memberCount: z.number(),
})
export type AdminMemoryOverviewResponse = z.infer<typeof AdminMemoryOverviewResponse>

export const MemoryFactSourceEnum = z.enum([MemoryFactSource.EXPLICIT, MemoryFactSource.AUTO])

/**
 * ENGINE-scoped memory — used by flow steps running in the sandbox.
 *
 * A flow runs UNATTENDED on behalf of the organisation: its `EnginePrincipal` carries `projectId`
 * and `platform.id` but deliberately NO `userId`, because there is often no person to attribute a
 * scheduled or webhook-triggered run to. That is why these DTOs admit only the org-owned scopes —
 * PLATFORM (shared team knowledge) and FLOW (what one flow learned across its runs).
 *
 * `USER` is absent from the enum ON PURPOSE, not by omission: a flow has no user identity, so
 * personal memory is unreachable from a flow by construction rather than by a check that could be
 * forgotten. `platformId` and `flowId` are taken from the engine token server-side and are NOT
 * accepted here — otherwise one flow could name another flow's id and read its memory.
 */
const EngineMemoryScopeEnum = z.enum([AgentMemoryScope.PLATFORM, AgentMemoryScope.FLOW])

export const EngineRecallMemoryRequest = z.object({
    q: z.string().min(1),
    scope: EngineMemoryScopeEnum.optional(),
    limit: z.coerce.number().int().positive().max(25).optional(),
})
export type EngineRecallMemoryRequest = z.infer<typeof EngineRecallMemoryRequest>

export const EngineRememberMemoryRequest = z.object({
    content: z.string().min(1).max(2000),
    kind: MemoryKindEnum.optional(),
    scope: EngineMemoryScopeEnum.optional(),
})
export type EngineRememberMemoryRequest = z.infer<typeof EngineRememberMemoryRequest>

export const EngineRememberMemoryResponse = z.object({
    saved: z.boolean(),
    refused: z.boolean().optional(),
    id: z.string().optional(),
})
export type EngineRememberMemoryResponse = z.infer<typeof EngineRememberMemoryResponse>
