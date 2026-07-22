#!/usr/bin/env node
/**
 * Add a one-line `summary:` to route schemas that already carry `tags:` + `description:`, so the
 * Docusaurus OpenAPI plugin (which needs `summary || operationId`) can render them.
 *
 * SCOPE: only the 16 snapshot tag-groups (the current public API surface). Routes tagged for
 * internal reasons (browser-agent, chat, memory-engine, etc.) are NOT in this list and are left
 * untouched, matching the owner's "publish only the snapshot's routes" decision.
 *
 * SAFETY:
 *  - Inserts a `summary: '...'` line immediately BEFORE an existing `description: '...'` line. It
 *    never edits security, params, body, or handler code.
 *  - The `summary` text is keyed to the EXACT existing `description` string, so a route only gets a
 *    summary if its description matches one we deliberately mapped — no fuzzy matching, no guessing.
 *  - Idempotent: if a `summary:` already precedes the description, it is skipped.
 *  - Reports every file touched and every unmatched description, so nothing is silently missed.
 *
 * Verify after running: tsc (0 errors) + the api unit suite (797).
 */
const fs = require('fs')
const path = require('path')

const API = path.join(__dirname, '..', '..', 'packages', 'server', 'api', 'src', 'app')

// description (verbatim, as it appears in code)  ->  summary (concise, imperative)
// Grouped by controller file for readability. Only snapshot-group routes.
const FILES = {
    'flows/flow/flow.controller.ts': {
        'Apply an operation to a flow': 'Update a flow',
        'Create a flow': 'Create a flow',
        'List flows': 'List flows',
        'Export flow as template': 'Export a flow as a template',
        'Get a flow by id': 'Get a flow',
        'Delete a flow': 'Delete a flow',
    },
    'flows/flow-run/flow-run-controller.ts': {
        'List Flow Runs': 'List flow runs',
        'Get Flow Run': 'Get a flow run',
        'Cancel multiple paused/queued flow runs': 'Cancel flow runs',
        'Count Flow Runs by Status': 'Count flow runs by status',
    },
    'tables/table/table.controller.ts': {
        'List tables': 'List tables',
        'Count tables': 'Count tables',
        'Delete a table': 'Delete a table',
        'Get a table by id': 'Get a table',
        'Export a table': 'Export a table',
        'Create a table webhook': 'Create a table webhook',
        'Delete a table webhook': 'Delete a table webhook',
        'Update a table': 'Update a table',
        'Clear all records from a table': 'Clear a table',
        'Export table as template': 'Export a table as a template',
    },
    'tables/record/record.controller.ts': {
        'Update a record': 'Update a record',
        'Delete records': 'Delete records',
        'List records': 'List records',
    },
    'app-connection/app-connection.controller.ts': {
        'Upsert an app connection based on the app name': 'Upsert an app connection',
        'Update an app connection value': 'Update an app connection',
        'Replace app connections': 'Replace app connections',
        'List app connections': 'List app connections',
        'List app connection owners': 'List app connection owners',
        'Delete an app connection': 'Delete an app connection',
        'Get OAuth2 authorization URL': 'Get an OAuth2 authorization URL',
    },
    'template/template.controller.ts': {
        'Get categories of templates.': 'List template categories',
        'Get a template.': 'Get a template',
        'List templates.': 'List templates',
        'Delete a template.': 'Delete a template',
        'Create a template.': 'Create a template',
        'Update a template.': 'Update a template',
    },
    'flows/folder/folder.module.ts': {
        'Create a new folder': 'Create a folder',
        'Update an existing folder': 'Update a folder',
        'Get a folder by id': 'Get a folder',
        'List folders': 'List folders',
        'Delete a folder': 'Delete a folder',
    },
    'user-invitations/user-invitation.module.ts': {
        'Send a user invitation to a user. If the user already has an invitation, the invitation will be updated.': 'Send a user invitation',
    },
    'user/platform/platform-user-controller.ts': {
        'List users': 'List users',
        'Update user': 'Update a user',
        'Delete user': 'Delete a user',
    },
    'platform/platform.controller.ts': {
        'Get a platform by id': 'Get a platform',
    },
    'mcp/mcp-platform-controller.ts': {
        'Get the platform MCP server configuration': 'Get the platform MCP server',
        'Update the platform MCP server configuration': 'Update the platform MCP server',
        'Rotate the platform MCP server token': 'Rotate the platform MCP server token',
    },
    'mcp/mcp-server-controller.ts': {
        'Update the project MCP server configuration': 'Update the project MCP server',
        'Get an MCP server by ID': 'Get an MCP server',
        'Rotate the MCP server token': 'Rotate the MCP server token',
    },
    'knowledge-base/knowledge-base.controller.ts': {
        'Register a file for knowledge base ingestion': 'Register a knowledge base file',
        'Upload a file and create a knowledge base file record': 'Upload a knowledge base file',
        'List knowledge base files for the project': 'List knowledge base files',
        'Delete a knowledge base file and all its chunks': 'Delete a knowledge base file',
        'Get the number of chunks for a knowledge base file': 'Count knowledge base file chunks',
        'Extract text chunks from a knowledge base file': 'Extract knowledge base file chunks',
        'Store or update chunks for a knowledge base file. Provide id to update existing chunks, or content to create new ones.': 'Store knowledge base chunks',
        'List chunks for a knowledge base file, optionally filtered by embedding status': 'List knowledge base file chunks',
        'Search knowledge base using vector similarity': 'Search the knowledge base',
    },
    'agents/agent-tools-controller.ts': {
        'Probe an external MCP server configured as an agent tool and return its tool names. The outbound call is routed through the SSRF-filtered safeHttp axios; all failure modes collapse to a single generic error so the response cannot be used for port or network reconnaissance.': 'Probe an agent MCP tool server',
    },
}

function applyFile(relPath, map) {
    const file = path.join(API, relPath)
    if (!fs.existsSync(file)) return {file: relPath, error: 'missing file'}
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const out = []
    const matched = new Set()
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const m = line.match(/^(\s*)description:\s*'(.*)',?\s*$/)
        if (m) {
            const [, indent, desc] = m
            const summary = map[desc]
            const prev = out[out.length - 1] || ''
            if (summary && !/^\s*summary:/.test(prev)) {
                out.push(`${indent}summary: '${summary.replace(/'/g, "\\'")}',`)
                matched.add(desc)
            }
        }
        out.push(line)
    }
    fs.writeFileSync(file, out.join('\n'))
    const unmatched = Object.keys(map).filter((d) => !matched.has(d))
    return {file: relPath, added: matched.size, unmatched}
}

const results = Object.entries(FILES).map(([f, map]) => applyFile(f, map))
let total = 0
for (const r of results) {
    if (r.error) {
        console.log(`  ERROR ${r.file}: ${r.error}`)
        continue
    }
    total += r.added
    console.log(`  ${r.added} added | ${r.file}`)
    if (r.unmatched.length) console.log(`     UNMATCHED (description not found verbatim): ${r.unmatched.join(' | ')}`)
}
console.log(`\ntotal summaries added: ${total}`)
