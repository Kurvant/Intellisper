#!/usr/bin/env node
/**
 * Post-process the LIVE-generated docs/openapi.json down to the published public API surface.
 *
 * gen-openapi.ts dumps the running server's full spec (161 ops). The running edition is `cloud`, so
 * it includes internal control-plane groups that were never part of the documented public API. This
 * filter enforces the owner's decision "publish only the snapshot's routes":
 *
 *   1. Strip the `/api` path prefix (setupServer mounts the API under /api; the docs' server URL is
 *      https://api.intellisper.com with NO /api segment, so paths must read /v1/...). The stale
 *      snapshot's paths were /v1/... — this restores that.
 *   2. Keep ONLY operations whose tag is in ALLOWED (the snapshot's public groups, minus phantoms,
 *      minus chat, minus blocks — see decisions below). Everything else (browser-agent, ai-gateway,
 *      memory, variables, and any untagged straggler) is dropped from the published spec. The routes
 *      still serve at runtime; this only controls what the docs advertise.
 *   3. Drop any path object left with no operations, and prune the top-level `tags` list + any now-
 *      unreferenced component schemas is intentionally NOT done (harmless extra schemas; the OpenAPI
 *      docs plugin only renders operations).
 *
 * Decisions (owner, 2026-07-18):
 *   - blocks: DROP entirely. Snapshot's only blocks op (POST /v1/blocks) is a phantom in this fork;
 *     the real read routes were never in the snapshot. No blocks group published.
 *   - browser-agent / ai-gateway / memory / variables: EXCLUDE (internal, not in snapshot).
 *   - chat: already excluded (untagged in code; NOT public — earlier decision).
 *
 * Idempotent: re-running on an already-filtered spec is a no-op (prefix already stripped, only ALLOWED
 * tags remain). Run AFTER gen-openapi.ts, on docs/openapi.json in place.
 */
const fs = require('fs')
const path = require('path')

const ALLOWED = new Set([
    'agent',
    'app-connections',
    'flow-runs',
    'flows',
    'folders',
    'git-repos',
    'global-connections',
    'knowledge-base',
    'mcp',
    'mcp-oauth',
    'platforms',
    'project-members',
    'project-releases',
    'projects',
    'records',
    'sample-data',
    'tables',
    'templates',
    'user-invitations',
    'users',
    'worker-machines',
])

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']

const specPath = path.resolve(__dirname, '..', 'openapi.json')
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))

const newPaths = {}
let kept = 0
let dropped = 0
const droppedByTag = {}
const keptTags = new Set()

for (const [rawPath, ops] of Object.entries(spec.paths || {})) {
    // 1. strip the /api mount prefix
    const cleanPath = rawPath.replace(/^\/api(?=\/)/, '')

    const keptOps = {}
    for (const [method, op] of Object.entries(ops)) {
        if (!HTTP_METHODS.includes(method)) {
            // preserve path-level fields (parameters, etc.) verbatim
            keptOps[method] = op
            continue
        }
        const tags = op.tags || []
        const publish = tags.some((t) => ALLOWED.has(t))
        if (publish) {
            keptOps[method] = op
            kept++
            tags.forEach((t) => { if (ALLOWED.has(t)) keptTags.add(t) })
        }
        else {
            dropped++
            const key = tags[0] || '(untagged)'
            droppedByTag[key] = (droppedByTag[key] || 0) + 1
        }
    }

    // 3. only keep the path if it still has at least one HTTP op
    const hasOp = Object.keys(keptOps).some((k) => HTTP_METHODS.includes(k))
    if (hasOp) newPaths[cleanPath] = keptOps
}

spec.paths = newPaths

// prune the top-level tags[] declaration to what remains (keeps the spec tidy; optional)
if (Array.isArray(spec.tags)) {
    spec.tags = spec.tags.filter((t) => keptTags.has(t.name))
}

fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n')

console.log(`kept ${kept} operations across ${[...keptTags].sort().length} tags`)
console.log(`tags: ${[...keptTags].sort().join(', ')}`)
console.log(`dropped ${dropped} operations:`)
for (const [t, n] of Object.entries(droppedByTag).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${t}`)
}
