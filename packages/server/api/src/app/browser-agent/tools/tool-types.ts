import type { FastifyBaseLogger } from 'fastify'

/** Where a tool runs. SERVER tools execute inline in the runtime; EXTENSION tools are dispatched
 * to the Chrome extension as a browser action (which pauses the run). */
export const ToolExecutionSite = {
    SERVER: 'SERVER',
    EXTENSION: 'EXTENSION',
} as const
export type ToolExecutionSite = (typeof ToolExecutionSite)[keyof typeof ToolExecutionSite]

/** Safety class. CONSEQUENTIAL always requires explicit user approval. */
export const ToolActionClass = {
    SAFE: 'SAFE',
    REVERSIBLE: 'REVERSIBLE',
    CONSEQUENTIAL: 'CONSEQUENTIAL',
} as const
export type ToolActionClass = (typeof ToolActionClass)[keyof typeof ToolActionClass]

/** The untrusted page snapshot a run may carry (from the extension). Opaque to the engine. */
export type PageContext = {
    url: string
    title: string
    docType?: string
    text?: string
    interactables?: unknown[]
} | null

/** A read-only view of a gathered research source, handed to compileReport. */
export type ResearchSourceView = {
    url: string
    title: string
    extract: string
    via: 'fetch' | 'tab'
}

/** Scope + context a SERVER tool executes against. Read-only; the runtime builds it per turn. */
export type ToolScope = {
    userId: string
    platformId: string
    projectId: string
    runId: string
    page: PageContext
    log: FastifyBaseLogger
    /** Sources gathered this run — populated only for compileReport. */
    researchSources?: ResearchSourceView[]
}

/** A SERVER tool's result. `citations` / `source` are surfaced to the client when present. */
export type ToolResult = {
    ok: boolean
    observation: Record<string, unknown>
    error?: string
}

/** A registered tool. SERVER tools carry `execute`; EXTENSION tools do not (the extension runs them). */
export type BrowserAgentTool = {
    name: string
    description: string
    parameters: Record<string, unknown>
    actionClass: ToolActionClass
    executionSite: ToolExecutionSite
    /** SERVER tools only — runs inline in the runtime. */
    execute?: (args: Record<string, unknown>, scope: ToolScope) => Promise<ToolResult>
}
