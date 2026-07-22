import { browserAgentRoutine, type RoutineScope } from '../routine/browser-agent-routine.service'
import { type BrowserAgentTool, ToolActionClass, ToolExecutionSite, type ToolResult, type ToolScope } from './tool-types'

/**
 * Routine tools — SERVER-executed. `saveRoutine` records the CURRENT run's executed browser actions
 * into a reusable routine (REVERSIBLE — it can be deleted); `listRoutines` and `runRoutine` are SAFE.
 *
 * `runRoutine` returns the resolved replay PLAN as DATA — the agent-driven replay path: the model
 * executes each step with its normal browser-action tools + self-heal reasoning. (The zero-token
 * DETERMINISTIC replay path is the /routines/replay SSE route, driven by the runtime, not a tool.)
 */
function routineScope(scope: ToolScope): RoutineScope {
    return { userId: scope.userId, platformId: scope.platformId, projectId: scope.projectId }
}

async function saveRoutineExecute(args: Record<string, unknown>, scope: ToolScope): Promise<ToolResult> {
    const name = typeof args.name === 'string' ? args.name : ''
    const description = typeof args.description === 'string' ? args.description : undefined
    try {
        // Records from the CURRENT run (the one this tool call belongs to). If no name was supplied,
        // the auto-save path derives one from the conversation and infers params from typed values.
        const result: { routine: { id: string, name: string }, stepCount: number, inferredParams?: string[] } = name.trim()
            ? await browserAgentRoutine(scope.log).recordFromRun(routineScope(scope), scope.runId, name, { description })
            : await browserAgentRoutine(scope.log).saveFromRunAuto(routineScope(scope), scope.runId, { description })
        const inferred = result.inferredParams ?? []
        return { ok: true, observation: { saved: true, routineId: result.routine.id, name: result.routine.name, steps: result.stepCount, ...(inferred.length ? { inferredParams: inferred } : {}) } }
    }
    catch (err) {
        // Surface the reason (e.g. "no replayable browser actions") to the model as a friendly note.
        return { ok: false, observation: { saved: false, note: friendly(err) } }
    }
}

async function listRoutinesExecute(args: Record<string, unknown>, scope: ToolScope): Promise<ToolResult> {
    const search = typeof args.search === 'string' ? args.search : undefined
    const { routines } = await browserAgentRoutine(scope.log).list(routineScope(scope), search, 1, 25)
    return { ok: true, observation: { routines: routines.map((r) => ({ id: r.id, name: r.name, description: r.description, params: r.params })) } }
}

async function runRoutineExecute(args: Record<string, unknown>, scope: ToolScope): Promise<ToolResult> {
    const nameOrId = typeof args.routine === 'string' ? args.routine : ''
    const paramValues = (args.paramValues && typeof args.paramValues === 'object') ? args.paramValues as Record<string, unknown> : {}
    const routines = browserAgentRoutine(scope.log)
    try {
        const routine = await routines.resolveByNameOrId(routineScope(scope), nameOrId)
        if (!routine) return { ok: false, observation: { note: `No routine named "${nameOrId}" was found.` } }
        const { steps } = await routines.getWithSteps(routineScope(scope), routine.id)
        const plan = routines.buildReplayPlan(routine, steps, paramValues)
        // Return the plan as DATA — the model drives the steps with its browser-action tools.
        return { ok: true, observation: { routine: { id: routine.id, name: routine.name }, plan: plan.map((s) => ({ ordinal: s.ordinal, action: s.action, args: s.args, intent: s.intent, locators: s.locators, ...(s.config ? { config: s.config } : {}) })) } }
    }
    catch (err) {
        return { ok: false, observation: { note: friendly(err) } }
    }
}

/** Extract the human message from an IntellisperError (or fall back). */
function friendly(err: unknown): string {
    const params = (err as { error?: { params?: { message?: string } } })?.error?.params
    if (params?.message) return params.message
    return (err as Error)?.message ?? 'The routine operation failed.'
}

export const routineTools: BrowserAgentTool[] = [
    {
        name: 'saveRoutine',
        description: 'Save the actions performed in this session as a reusable Routine that can be re-run later with different inputs. Optionally give it a name.',
        parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: [] },
        actionClass: ToolActionClass.REVERSIBLE,
        executionSite: ToolExecutionSite.SERVER,
        execute: saveRoutineExecute,
    },
    {
        name: 'listRoutines',
        description: 'List the user\'s saved Routines (optionally filtered by a search term).',
        parameters: { type: 'object', properties: { search: { type: 'string' } }, required: [] },
        actionClass: ToolActionClass.SAFE,
        executionSite: ToolExecutionSite.SERVER,
        execute: listRoutinesExecute,
    },
    {
        name: 'runRoutine',
        description: 'Fetch the step plan for a saved Routine (by name or id) with parameter values substituted, so you can execute it step by step with your browser-action tools.',
        parameters: { type: 'object', properties: { routine: { type: 'string' }, paramValues: { type: 'object' } }, required: ['routine'] },
        actionClass: ToolActionClass.SAFE,
        executionSite: ToolExecutionSite.SERVER,
        execute: runRoutineExecute,
    },
]
