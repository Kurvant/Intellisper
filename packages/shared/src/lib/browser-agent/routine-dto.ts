import { z } from 'zod'
import { Nullable } from '../core/common/base-model'
import { Routine, RoutineParam, RoutineRunStatus } from './routine'

/**
 * Routine (record → replay → self-heal) request/response DTOs. The routine store is recorded FROM a
 * finished agent run (no live DOM recorder), then replayed with new parameter values either
 * agent-driven (the runWorkflow tool returns the plan as DATA) or deterministically (the /automation
 * /replay SSE route walks the steps with zero model turns on the happy path).
 */

// ── Management: record / save / list / get / edit / delete ──────────────────────────────────────

/** Record a routine from a finished run's executed browser actions (explicit name + params). */
export const RecordRoutineRequest = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    params: z.array(RoutineParam).max(50).optional(),
})
export type RecordRoutineRequest = z.infer<typeof RecordRoutineRequest>

/** One-click save from a run: derive the name from the conversation + auto-infer params. */
export const SaveRoutineFromRunRequest = z.object({
    projectId: z.string(),
    name: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
})
export type SaveRoutineFromRunRequest = z.infer<typeof SaveRoutineFromRunRequest>

export const ListRoutinesRequest = z.object({
    projectId: z.string(),
    search: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListRoutinesRequest = z.infer<typeof ListRoutinesRequest>

/** A compact routine card (list view). */
export const RoutineSummary = z.object({
    id: z.string(),
    name: z.string(),
    description: Nullable(z.string()),
    params: z.array(RoutineParam),
    version: z.number(),
    updated: z.string(),
})
export type RoutineSummary = z.infer<typeof RoutineSummary>

export const ListRoutinesResponse = z.object({
    routines: z.array(RoutineSummary),
    total: z.number(),
})
export type ListRoutinesResponse = z.infer<typeof ListRoutinesResponse>

/** A recorded step as returned to the management UI (locators shape is opaque). */
export const RoutineStepView = z.object({
    id: z.string(),
    ordinal: z.number(),
    action: z.string(),
    intent: z.string(),
    locators: z.record(z.string(), z.unknown()),
    config: Nullable(z.record(z.string(), z.unknown())),
})
export type RoutineStepView = z.infer<typeof RoutineStepView>

export const GetRoutineResponse = z.object({
    routine: Routine,
    steps: z.array(RoutineStepView),
})
export type GetRoutineResponse = z.infer<typeof GetRoutineResponse>

export const RenameRoutineRequest = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
})
export type RenameRoutineRequest = z.infer<typeof RenameRoutineRequest>

export const UpdateRoutineParamsRequest = z.object({
    projectId: z.string(),
    params: z.array(RoutineParam).max(50),
})
export type UpdateRoutineParamsRequest = z.infer<typeof UpdateRoutineParamsRequest>

export const ReorderRoutineStepsRequest = z.object({
    projectId: z.string(),
    orderedStepIds: z.array(z.string()).min(1),
})
export type ReorderRoutineStepsRequest = z.infer<typeof ReorderRoutineStepsRequest>

/** Project-scoped body with no other fields (delete / duplicate / delete-step). */
export const RoutineProjectRequest = z.object({
    projectId: z.string(),
})
export type RoutineProjectRequest = z.infer<typeof RoutineProjectRequest>

export const SaveRoutineResponse = z.object({
    routine: Routine,
    stepCount: z.number(),
    inferredParams: z.array(z.string()).optional(),
})
export type SaveRoutineResponse = z.infer<typeof SaveRoutineResponse>

// ── Replay (deterministic, SSE) ─────────────────────────────────────────────────────────────────

/** Kick off a deterministic replay of a saved routine (interactive side-panel run). */
export const ReplayRoutineRequest = z.object({
    projectId: z.string(),
    /** Routine id OR case-insensitive name (the runRoutine tool resolves either). */
    routine: z.string().min(1),
    paramValues: z.record(z.string(), z.unknown()).optional(),
})
export type ReplayRoutineRequest = z.infer<typeof ReplayRoutineRequest>

// ── History ─────────────────────────────────────────────────────────────────────────────────────

export const ListRoutineRunsRequest = z.object({
    projectId: z.string(),
    routineId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListRoutineRunsRequest = z.infer<typeof ListRoutineRunsRequest>

export const RoutineRunSummary = z.object({
    id: z.string(),
    routineId: z.string(),
    agentRunId: Nullable(z.string()),
    status: z.enum([
        RoutineRunStatus.PENDING,
        RoutineRunStatus.RUNNING,
        RoutineRunStatus.PAUSED,
        RoutineRunStatus.COMPLETED,
        RoutineRunStatus.FAILED,
    ]),
    progress: Nullable(z.record(z.string(), z.unknown())),
    startedAt: Nullable(z.string()),
    endedAt: Nullable(z.string()),
})
export type RoutineRunSummary = z.infer<typeof RoutineRunSummary>

export const ListRoutineRunsResponse = z.object({
    runs: z.array(RoutineRunSummary),
})
export type ListRoutineRunsResponse = z.infer<typeof ListRoutineRunsResponse>

// ── Replay plan (server-internal contract; not a wire DTO, but shared for typing) ────────────────

/**
 * One resolved, ready-to-execute replay step. `locators` are tried in priority order by the
 * extension's deterministic resolver; `intent` is the natural-language fallback the runtime
 * self-heals from when no locator resolves on the live page. `config` carries condition/extract
 * step configuration (with any `{{param}}` placeholders already substituted).
 */
export const ReplayStep = z.object({
    ordinal: z.number(),
    action: z.string(),
    locators: z.record(z.string(), z.unknown()),
    args: z.record(z.string(), z.unknown()),
    intent: z.string(),
    config: z.record(z.string(), z.unknown()).optional(),
})
export type ReplayStep = z.infer<typeof ReplayStep>
