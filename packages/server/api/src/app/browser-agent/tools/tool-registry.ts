import type { ProviderToolDef } from '../model-provider/model-provider.types'
import { browserActionTools } from './browser-action.tools'
import { fileTools } from './file.tools'
import { memoryTools } from './memory.tools'
import { pageIntelligenceTools } from './page-intelligence.tools'
import { researchTools } from './research.tools'
import { routineTools } from './routine.tools'
import { type BrowserAgentTool, ToolActionClass } from './tool-types'

/**
 * The browser-agent tool registry. Assembles the core tools (page intelligence + browser actions +
 * memory + research + files + routines) and resolves them by name.
 */
const ALL_TOOLS: BrowserAgentTool[] = [
    ...pageIntelligenceTools,
    ...browserActionTools,
    ...memoryTools,
    ...researchTools,
    ...fileTools,
    ...routineTools,
]

/** Tools that gather a research source (counted against the per-run source budget). */
export const RESEARCH_SOURCE_TOOLS = new Set(['fetchUrl'])

const BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]))

export const browserAgentToolRegistry = {
    resolve(name: string): BrowserAgentTool | undefined {
        return BY_NAME.get(name)
    },

    /** Model-facing tool definitions (name/description/schema — no execute). */
    definitions(): ProviderToolDef[] {
        return ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
    },

    /** The engine's 3-value action class for a tool name (default safe if unknown). */
    classOf(name: string): 'safe' | 'reversible' | 'consequential' {
        const t = BY_NAME.get(name)
        if (!t) return 'safe'
        return t.actionClass === ToolActionClass.CONSEQUENTIAL ? 'consequential'
            : t.actionClass === ToolActionClass.REVERSIBLE ? 'reversible' : 'safe'
    },

    all(): BrowserAgentTool[] {
        return ALL_TOOLS
    },
}
