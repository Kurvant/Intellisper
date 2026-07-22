#!/usr/bin/env node
/**
 * Generate `docs-site/sidebars.ts` from the APPROVED page map.
 *
 * Source of truth: `_nav-inventory.json` (machine-extracted from the legacy Mintlify `docs.json`) +
 * the tab/group mapping approved in `docs-overhaul-page-map.md` §2/§4.
 *
 * WHY GENERATED: the map places 216 existing pages. Hand-transcribing them into a sidebar is exactly
 * where a page gets silently dropped — the one thing this migration must not do. So the sidebar is
 * derived, and the count is asserted (see the gate at the bottom).
 *
 * HANDBOOK: deliberately NOT emitted. It is internal-facing (compensation, hiring levels, on-call,
 * infra/security playbooks, postmortems — inherited Activepieces internal docs) and must not ship
 * publicly. Its 34 pages are retained in-repo but excluded from the public build. See page-map §2b.
 * NOTE `unlisted:` is NOT protection (the page still builds and is reachable by URL) — exclusion is
 * enforced by (a) omitting it from navigation here and (b) a post-build route/sitemap leak check.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '_nav-inventory.json'), 'utf8'))

// The approved destination for each legacy (tab, group). Only Overview is restructured; the other
// tabs keep their shape. Handbook -> null = withheld from the public site.
const destination = (tab, group) => {
    if (tab === 'Overview') {
        if (group === 'Overview') return ['overview', 'Start here']
        if (group === 'Flows') return ['studio', 'Flows']
        if (group === 'MCP Server') return ['studio', 'MCP server']
        if (group === 'About') return ['overview', 'About']
    }
    if (tab === 'Admin Guide') return ['admin-guide', group]
    if (tab === 'Deploy') return ['deploy', group]
    if (tab === 'Embedding') return ['embedding', group]
    if (tab === 'Build Blocks') return ['build-blocks', group]
    if (tab === 'API Reference') {
        // MEASURED: 54 of these 55 pages are body-less Mintlify stubs (`openapi: GET /v1/flows`)
        // that render from the spec — there is no prose to port. Docusaurus generates its own
        // equivalents from `openapi.json` (phase M4), so porting the stubs would create 54 empty
        // pages that M4 then has to delete. Only `endpoints/overview` carries real content.
        // M4 is now DONE: the OpenAPI plugin emits the operation pages + `apisidebar` groups from
        // the regenerated spec; this generator composes that slice under `api-reference` below.
        return group === 'Get Started' ? ['api-reference', group] : null
    }
    if (tab === 'Handbook') return null // withheld — see header
    throw new Error(`Unmapped tab: ${tab} / ${group}`)
}

// sidebarId -> { groupLabel -> [docId] }, preserving inventory order.
const sidebars = {}
let placed = 0
let withheldHandbook = 0
let deferredToOpenApi = 0

for (const row of rows) {
    const dest = destination(row.tab, row.group)
    if (dest === null) {
        if (row.tab === 'Handbook') withheldHandbook++
        else deferredToOpenApi++
        continue
    }
    const [sidebarId, groupLabel] = dest
        ;(sidebars[sidebarId] ||= {})
        ;(sidebars[sidebarId][groupLabel] ||= []).push(row.page)
    placed++
}

// ---- The gate: EVERY page has an explicit, intended fate. None invented, none lost. ----
// Three fates, and the maths must close: placed + withheld + deferred === the full inventory.
if (placed + withheldHandbook + deferredToOpenApi !== rows.length) {
    throw new Error(
        `Page accounting failed: ${placed} placed + ${withheldHandbook} withheld + ` +
        `${deferredToOpenApi} deferred !== ${rows.length} total`,
    )
}
const HANDBOOK_EXPECTED = 34
if (withheldHandbook !== HANDBOOK_EXPECTED) {
    throw new Error(`Expected ${HANDBOOK_EXPECTED} withheld Handbook pages, got ${withheldHandbook}`)
}
// 55 API Reference pages: 1 real (`endpoints/overview`) is placed, 54 spec-stubs are regenerated.
const OPENAPI_STUBS_EXPECTED = 54
if (deferredToOpenApi !== OPENAPI_STUBS_EXPECTED) {
    throw new Error(`Expected ${OPENAPI_STUBS_EXPECTED} OpenAPI stubs deferred, got ${deferredToOpenApi}`)
}

// Sidebar ids that receive net-new C4c pages via `authoredAdditions` (sidebars-authored.ts). Keep in
// sync with the keys of that export. The generator only splices a reference; the content lives there.
const ADDITION_IDS = new Set(['studio', 'admin-guide'])

const toCategory = (label, docIds) => ({
    type: 'category',
    label,
    collapsed: false,
    items: docIds,
})

const body = Object.entries(sidebars).map(([id, groups]) => {
    const items = Object.entries(groups).map(([label, docIds]) =>
        // A single-page group renders better as the page itself than a category of one.
        docIds.length === 1 && label === 'Start here' ? docIds[0] : toCategory(label, docIds),
    )
    // Quote the key: sidebar ids are kebab-case (`admin-guide`), which is not a valid bare
    // identifier in an object literal.
    const serialized = JSON.stringify(items, null, 8).replace(/\n/g, '\n    ')
    // The API Reference sidebar = our authored "Get Started" intro, then the operation groups the
    // OpenAPI plugin generated from the spec (imported, not transcribed — so a spec change never
    // needs a hand edit here). Splice `...apiSidebar.apisidebar` into the emitted array literal.
    if (id === 'api-reference') {
        // Insert a comma after the last authored item, then the spread of the generated groups.
        // The plugin's sidebar.ts default-exports the array itself (`export default sidebar.apisidebar`).
        const spliced = serialized.replace(/\n(\s*)\]$/, ',\n$1  ...apiSidebar,\n$1]')
        return `    ${JSON.stringify(id)}: ${spliced},`
    }
    // Net-new C4c pages that belong inside this legacy-derived sidebar are appended from
    // `authoredAdditions[id]` (spread after the legacy groups). See sidebars-authored.ts.
    if (ADDITION_IDS.has(id)) {
        const spliced = serialized.replace(/\n(\s*)\]$/, `,\n$1  ...authoredAdditions[${JSON.stringify(id)}],\n$1]`)
        return `    ${JSON.stringify(id)}: ${spliced},`
    }
    return `    ${JSON.stringify(id)}: ${serialized},`
}).join('\n')

const out = `import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';
// GENERATED by the OpenAPI plugin (docusaurus gen-api-docs) from docs/openapi.json — the operation
// pages + their grouped sidebar. Composed under \`api-reference\` below, after the Get Started intro.
import apiSidebar from './docs/api-reference/sidebar';
// HAND-AUTHORED net-new section sidebars (Agent / Memory — phases C4/C4b). Spread in below so the
// legacy-derived sidebars and the authored ones live in one config. Edit sidebars-authored.ts, not here.
import authoredSidebars, {authoredAdditions} from './sidebars-authored';

/**
 * GENERATED by docs/rewrite/gen-sidebars.cjs from the approved page map — do not hand-edit.
 * Re-run: node docs/rewrite/gen-sidebars.cjs
 *
 * Page accounting (asserted by the generator — it throws if these do not close):
 *   ${placed} placed across ${Object.keys(sidebars).length} sidebars
 *   ${withheldHandbook} withheld  — Handbook: internal-facing, retained in-repo but never published
 *                  (page-map §2b). \`unlisted\` is NOT protection; exclusion is by omission
 *                  here plus a post-build route/sitemap leak check.
 *   ${deferredToOpenApi} deferred  — body-less Mintlify \`openapi:\` stubs; the OpenAPI plugin now
 *                  regenerates these from the spec (M4 done) and the generated \`apisidebar\`
 *                  is spliced into \`api-reference\` — porting the stubs would only duplicate them.
 *   ${placed + withheldHandbook + deferredToOpenApi} / ${rows.length} total — every legacy page has an explicit, intended fate.
 *
 * The Agent / Memory sidebars are authored in phases C4/C4b (net-new content), not generated here.
 */
const sidebars: SidebarsConfig = {
${body}
  ...authoredSidebars,
};

export default sidebars;
`

const target = path.join(ROOT, '..', 'docs-site', 'sidebars.ts')
fs.writeFileSync(target, out)

console.log(`placed:    ${placed}`)
console.log(`withheld:  ${withheldHandbook} (Handbook — internal, not published)`)
console.log(`deferred:  ${deferredToOpenApi} (OpenAPI spec-stubs — regenerated in M4)`)
console.log(`total:     ${placed + withheldHandbook + deferredToOpenApi} / ${rows.length}  ✅`)
console.log(`sidebars: ${Object.keys(sidebars).join(', ')}`)
console.log(`wrote:    ${path.relative(ROOT, target)}`)
