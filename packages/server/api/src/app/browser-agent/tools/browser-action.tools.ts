import { type BrowserAgentTool, ToolActionClass, ToolExecutionSite } from './tool-types'

/**
 * Browser-action tools — the agent's "hands". All EXECUTE IN THE EXTENSION (no server `execute`):
 * the runtime persists an action and pauses the run; the extension performs it on the live page and
 * POSTs the observation to resume. `submitForm` is CONSEQUENTIAL → explicit approval every time.
 *
 * The model targets elements by the stable `ref` ids from the page snapshot (read the page first).
 */
const refParam = { type: 'string', description: 'Stable element ref from the page snapshot.' }

export const browserActionTools: BrowserAgentTool[] = [
    {
        name: 'navigate',
        description: 'Navigate the current tab to a URL.',
        parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        actionClass: ToolActionClass.SAFE,
        executionSite: ToolExecutionSite.EXTENSION,
    },
    {
        name: 'click',
        description: 'Click an element on the page.',
        parameters: { type: 'object', properties: { ref: refParam, description: { type: 'string' } }, required: ['ref'] },
        actionClass: ToolActionClass.REVERSIBLE,
        executionSite: ToolExecutionSite.EXTENSION,
    },
    {
        name: 'type',
        description: 'Type text into an input/textarea. Refuses password/payment fields.',
        parameters: { type: 'object', properties: { ref: refParam, text: { type: 'string' }, field: { type: 'string' }, clearFirst: { type: 'boolean' } }, required: ['ref', 'text'] },
        actionClass: ToolActionClass.REVERSIBLE,
        executionSite: ToolExecutionSite.EXTENSION,
    },
    {
        name: 'selectOption',
        description: 'Select an option in a dropdown.',
        parameters: { type: 'object', properties: { ref: refParam, value: { type: 'string' }, field: { type: 'string' } }, required: ['ref', 'value'] },
        actionClass: ToolActionClass.REVERSIBLE,
        executionSite: ToolExecutionSite.EXTENSION,
    },
    {
        name: 'scroll',
        description: 'Scroll the page or to an element.',
        parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] }, ref: refParam }, required: ['direction'] },
        actionClass: ToolActionClass.SAFE,
        executionSite: ToolExecutionSite.EXTENSION,
    },
    {
        name: 'screenshot',
        description: 'Capture a screenshot of the visible page.',
        parameters: { type: 'object', properties: { ref: refParam } },
        actionClass: ToolActionClass.SAFE,
        executionSite: ToolExecutionSite.EXTENSION,
    },
    {
        name: 'submitForm',
        description: 'Submit a form. CONSEQUENTIAL — requires explicit user approval.',
        parameters: { type: 'object', properties: { ref: refParam, description: { type: 'string' } }, required: ['ref', 'description'] },
        actionClass: ToolActionClass.CONSEQUENTIAL,
        executionSite: ToolExecutionSite.EXTENSION,
    },
]
