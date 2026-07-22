import { z } from 'zod'

/**
 * Scoping + visibility primitives for the browser-agent (Intellisper) subsystem.
 *
 * Every browser-agent resource is owned by a single (platformId, userId) pair. Visibility is
 * user-private by default; a SHARABLE resource becomes visible to other members of the SAME
 * platform only when BOTH the platform admin has unlocked sharing AND the owner has opted in.
 * Memory is NEVER sharable regardless of either switch — see AgentSharableResourceType.
 *
 * These types are the single source of truth consumed by the server-side scope helper
 * (`agentScope`) and by the entities/DTOs. Enforcement lives in the application layer (the
 * mandatory scope helper + an automated no-bypass gate test); see the merge implementation plan.
 */

/** Ownership + tenancy scope carried by every browser-agent resource. */
export const AgentScope = z.object({
    platformId: z.string(),
    userId: z.string(),
})
export type AgentScope = z.infer<typeof AgentScope>

/**
 * Resource kinds whose rows CAN be shared across a platform (subject to the admin unlock + owner
 * opt-in). This list deliberately EXCLUDES memory (fact/entity/relation): auto-captured facts
 * about a person are always private and can never be exposed to teammates.
 */
export const AgentSharableResourceType = {
    CONVERSATION: 'CONVERSATION',
    RUN: 'RUN',
    ACTION: 'ACTION',
    ROUTINE: 'ROUTINE',
    ROUTINE_RUN: 'ROUTINE_RUN',
    BATCH: 'BATCH',
    AUDIT: 'AUDIT',
} as const
export type AgentSharableResourceType =
    (typeof AgentSharableResourceType)[keyof typeof AgentSharableResourceType]

/**
 * Resource kinds that are ALWAYS strictly private to their owner — never sharable under any
 * switch. Kept as an explicit, closed set so the exclusion is impossible to widen by accident.
 */
export const AgentAlwaysPrivateResourceType = {
    MEMORY_FACT: 'MEMORY_FACT',
    MEMORY_ENTITY: 'MEMORY_ENTITY',
    MEMORY_RELATION: 'MEMORY_RELATION',
    SCHEDULE: 'SCHEDULE',
    FILE: 'FILE',
    CONVERSATION_SETTINGS: 'CONVERSATION_SETTINGS',
} as const
export type AgentAlwaysPrivateResourceType =
    (typeof AgentAlwaysPrivateResourceType)[keyof typeof AgentAlwaysPrivateResourceType]

export type AgentResourceType = AgentSharableResourceType | AgentAlwaysPrivateResourceType

/** True iff a resource kind is eligible for platform sharing (i.e. not always-private). */
export function isAgentResourceSharable(type: AgentResourceType): boolean {
    return (Object.values(AgentSharableResourceType) as string[]).includes(type)
}

/**
 * The inputs the scope helper needs to compute visibility for a read. `sharingUnlocked` is the
 * platform-admin switch (from platform_plan); `viewerOptedIn` is the VIEWER's own opt-in flag
 * (a viewer only ever sees shared rows of owners who opted in — computed per-owner at query time).
 */
export const AgentVisibilityContext = z.object({
    platformId: z.string(),
    userId: z.string(),
    sharingUnlocked: z.boolean(),
})
export type AgentVisibilityContext = z.infer<typeof AgentVisibilityContext>
