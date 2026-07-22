import { z } from 'zod'
import { AgentRunStatus } from './run'

// ── Tier 1: the acting user's own runs ────────────────────────────────────────────────────────────

/** List the acting user's agent runs. projectId is required for project scoping (membership check). */
export const ListAgentRunsRequest = z.object({
    projectId: z.string(),
    /** Optional status filter. */
    status: z.nativeEnum(AgentRunStatus).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
})
export type ListAgentRunsRequest = z.infer<typeof ListAgentRunsRequest>

/** A run as shown in the "my activity" list — no checkpoint (opaque engine state), plus its task title. */
export const AgentRunView = z.object({
    id: z.string(),
    conversationId: z.string(),
    /** The parent conversation's title (the human-readable task), null if untitled. */
    title: z.string().nullable(),
    status: z.nativeEnum(AgentRunStatus),
    stepCount: z.number(),
    /** Accumulated billed-token cost (string — bigint column). */
    tokenCost: z.string(),
    haltReason: z.string().nullable(),
    startedAt: z.string().nullable(),
    endedAt: z.string().nullable(),
    createdAt: z.string(),
})
export type AgentRunView = z.infer<typeof AgentRunView>

export const ListAgentRunsResponse = z.object({
    runs: z.array(AgentRunView),
    total: z.number(),
})
export type ListAgentRunsResponse = z.infer<typeof ListAgentRunsResponse>

// ── Tier 2: tenant-admin platform-wide oversight ──────────────────────────────────────────────────

/** Admin oversight query. projectId scopes the membership/admin check; days is the moving window. */
export const AgentOversightRequest = z.object({
    projectId: z.string(),
    days: z.coerce.number().int().positive().max(366).optional(),
})
export type AgentOversightRequest = z.infer<typeof AgentOversightRequest>

const StatusCount = z.object({ status: z.nativeEnum(AgentRunStatus), count: z.number() })
const RunsByDay = z.object({ day: z.string(), runs: z.number() })
const TopRoutine = z.object({ routineId: z.string(), name: z.string().nullable(), runs: z.number() })
const AgentUserActivity = z.object({
    userId: z.string(),
    runs: z.number(),
    tokenCost: z.number(),
    lastRunAt: z.string().nullable(),
})

/**
 * Platform-wide agent activity for ONE tenant (the caller's own platform). Every figure is aggregated
 * across the users of that single platform — the server derives the platformId from the principal, so
 * this can never expose another tenant.
 */
export const AgentOversightResponse = z.object({
    from: z.string(),
    to: z.string(),
    totalRuns: z.number(),
    activeUsers: z.number(),
    /** Sum of billed-token cost across the window (number — may exceed 2^53 only at extreme scale). */
    totalTokenCost: z.number(),
    successRate: z.number(),
    runsByStatus: z.array(StatusCount),
    runsByDay: z.array(RunsByDay),
    topRoutines: z.array(TopRoutine),
    byUser: z.array(AgentUserActivity),
})
export type AgentOversightResponse = z.infer<typeof AgentOversightResponse>

// ── Tier 3: operator (Intellisper) cross-tenant — ENDPOINT ONLY, no UI ─────────────────────────────

export const AgentOperatorActivityRequest = z.object({
    days: z.coerce.number().int().positive().max(366).optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
})
export type AgentOperatorActivityRequest = z.infer<typeof AgentOperatorActivityRequest>

/** One tenant's rolled-up agent activity, for the operator's cross-tenant view. */
export const AgentOperatorPlatformRow = z.object({
    platformId: z.string(),
    totalRuns: z.number(),
    activeUsers: z.number(),
    totalTokenCost: z.number(),
})
export type AgentOperatorPlatformRow = z.infer<typeof AgentOperatorPlatformRow>

export const AgentOperatorActivityResponse = z.object({
    from: z.string(),
    to: z.string(),
    totalRuns: z.number(),
    totalTokenCost: z.number(),
    platforms: z.array(AgentOperatorPlatformRow),
})
export type AgentOperatorActivityResponse = z.infer<typeof AgentOperatorActivityResponse>
