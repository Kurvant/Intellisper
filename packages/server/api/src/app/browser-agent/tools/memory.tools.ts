import { AgentMemoryScope, MemoryFactKind, MemoryFactSource } from '@intelblocks/shared'
import { memoryPlan } from '../../memory/memory-plan.service'
import { browserAgentMemorySettings } from '../memory/browser-agent-memory-settings.service'
import { browserAgentMemory } from '../memory/browser-agent-memory.service'
import { type BrowserAgentTool, ToolActionClass, ToolExecutionSite, type ToolResult, type ToolScope } from './tool-types'

/**
 * Memory tools — SERVER-executed, and strictly the acting user's own memory: the service scopes
 * every op by (platformId, userId), so these tools cannot reach another member's facts. A fact
 * written here is born PRIVATE; it can only ever become admin-visible if the user later marks it
 * shared AND opts in AND the admin unlocked sharing. remember/forget are REVERSIBLE; recall is SAFE.
 *
 * PAID DOOR: persistent memory is a paid capability. On a plan without it these tools do not fail —
 * they return a plain, honest observation ("memory isn't on this plan"). That distinction matters:
 * a tool ERROR makes the model retry and derail the task, whereas a truthful observation lets it
 * simply carry on without memory, which is the intended free-tier experience.
 */
function memScope(scope: ToolScope): { userId: string, platformId: string } {
    return { userId: scope.userId, platformId: scope.platformId }
}

function parseKind(v: unknown): MemoryFactKind {
    const s = String(v ?? '').toUpperCase()
    return (Object.values(MemoryFactKind) as string[]).includes(s) ? (s as MemoryFactKind) : MemoryFactKind.NOTE
}

const NOT_ON_PLAN = 'Memory is not included on this plan, so nothing was saved or recalled. Continue without it and do not retry.'

async function rememberExecute(args: Record<string, unknown>, scope: ToolScope): Promise<ToolResult> {
    const content = typeof args.content === 'string' ? args.content : ''
    if (!(await memoryPlan(scope.log).isEnabled({ platformId: scope.platformId }))) {
        return { ok: true, observation: { saved: false, note: NOT_ON_PLAN } }
    }
    // The user's auto-capture opt-out. This governs the agent saving things ON ITS OWN INITIATIVE,
    // which is what this tool is: the user asked for a task, not for a fact to be stored.
    if (!(await browserAgentMemorySettings(scope.log).isAutoCaptureEnabled(scope.userId, scope.platformId))) {
        return { ok: true, observation: { saved: false, note: 'This user turned off automatic memory capture. Do not save facts; continue with the task.' } }
    }
    // The plan's stored-fact ceiling — reported as an observation, not an error, for the same reason.
    const room = await memoryPlan(scope.log).canStoreMoreFacts({ platformId: scope.platformId, userId: scope.userId })
    if (!room.allowed) {
        return { ok: true, observation: { saved: false, note: `Memory is full (${room.limit} facts). Nothing was saved; continue with the task.` } }
    }
    const result = await browserAgentMemory(scope.log).remember(memScope(scope), content, parseKind(args.kind), MemoryFactSource.EXPLICIT, AgentMemoryScope.USER)
    if (result.refused) {
        return { ok: true, observation: { saved: false, refused: true, note: 'That looks like a secret (password/card/token), so I did not save it.' } }
    }
    return { ok: true, observation: { saved: result.saved, id: result.id } }
}

async function recallExecute(args: Record<string, unknown>, scope: ToolScope): Promise<ToolResult> {
    const query = typeof args.query === 'string' ? args.query : ''
    const limit = typeof args.limit === 'number' ? args.limit : 5
    if (!(await memoryPlan(scope.log).isEnabled({ platformId: scope.platformId }))) {
        return { ok: true, observation: { facts: [], note: NOT_ON_PLAN } }
    }
    const facts = await browserAgentMemory(scope.log).recall(memScope(scope), query, limit)
    return { ok: true, observation: { facts } }
}

async function forgetExecute(args: Record<string, unknown>, scope: ToolScope): Promise<ToolResult> {
    const factId = typeof args.factId === 'string' ? args.factId : ''
    // NOT plan-gated, deliberately: deleting your own data must never be behind a paywall. If a plan
    // lapsed while facts remain stored, the user must still be able to erase them.
    const result = await browserAgentMemory(scope.log).forget(memScope(scope), factId)
    return { ok: result.ok, observation: { forgotten: result.ok } }
}

export const memoryTools: BrowserAgentTool[] = [
    {
        name: 'remember',
        description: 'Remember a durable fact about the user (a preference, project, task, contact, or note). Do not save secrets.',
        parameters: { type: 'object', properties: { content: { type: 'string' }, kind: { type: 'string', enum: ['PREFERENCE', 'PROJECT', 'TASK', 'CONTACT', 'NOTE'] } }, required: ['content'] },
        actionClass: ToolActionClass.REVERSIBLE,
        executionSite: ToolExecutionSite.SERVER,
        execute: rememberExecute,
    },
    {
        name: 'recall',
        description: 'Recall saved facts about the user relevant to a query.',
        parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
        actionClass: ToolActionClass.SAFE,
        executionSite: ToolExecutionSite.SERVER,
        execute: recallExecute,
    },
    {
        name: 'forget',
        description: 'Forget a previously saved fact by its id.',
        parameters: { type: 'object', properties: { factId: { type: 'string' } }, required: ['factId'] },
        actionClass: ToolActionClass.REVERSIBLE,
        executionSite: ToolExecutionSite.SERVER,
        execute: forgetExecute,
    },
]
