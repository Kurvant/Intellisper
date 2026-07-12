#!/usr/bin/env node
/**
 * Deletes @intelblocks/* packages from a GitHub org's Packages (npm registry), so
 * they can be republished at the SAME version with corrected metadata.
 *
 * Why this exists: published versions are immutable. A batch of packages went out
 * with a broken `main` (pointed at ./dist/src/... but the tarball root already IS
 * dist/). Deleting + republishing the same versions keeps the block catalog — which
 * references exact versions — unchanged.
 *
 * Safe by design:
 *   - dry-run by default; pass --write to actually DELETE
 *   - lists what it will delete first
 *   - per-package error handling + JSON report
 *
 * Requires:
 *   - GITHUB_TOKEN env var with `delete:packages` (and read:packages) scope
 *   - --org=<org>   (e.g. --org=intelblocks)
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/delete-org-packages.mjs --org=intelblocks
 *   GITHUB_TOKEN=ghp_xxx node scripts/delete-org-packages.mjs --org=intelblocks --write
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const WRITE = process.argv.includes('--write')
const ORG = (process.argv.find((a) => a.startsWith('--org=')) || '').replace('--org=', '')
const TOKEN = process.env.GITHUB_TOKEN
const API = 'https://api.github.com'

if (!ORG) {
    console.error('Missing --org=<org>. e.g. --org=intelblocks')
    process.exit(1)
}
if (!TOKEN) {
    console.error('Missing GITHUB_TOKEN env var (needs delete:packages scope).')
    process.exit(1)
}

// A GitHub Packages npm package is named WITHOUT the scope, e.g. "@intelblocks/block-airtable"
// is stored as package "block-airtable" under the org. The scope maps to the org.
function ghPackageName(fullName) {
    return fullName.replace(/^@[^/]+\//, '')
}

const files = execSync('git ls-files "packages/**/package.json"', { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)

const names = []
for (const f of files) {
    const json = JSON.parse(readFileSync(f, 'utf8'))
    if ((json.name || '').startsWith('@intelblocks/')) names.push(json.name)
}

console.log(`org: ${ORG} | @intelblocks packages found: ${names.length} | mode: ${WRITE ? 'DELETE' : 'dry-run'}\n`)

const report = { org: ORG, mode: WRITE ? 'delete' : 'dry-run', deleted: [], notFound: [], failed: [] }

function api(method, path) {
    // curl is available cross-platform; returns HTTP status on its own line.
    const cmd = `curl -sS -o /dev/null -w "%{http_code}" -X ${method} `
        + `-H "Accept: application/vnd.github+json" `
        + `-H "Authorization: Bearer ${TOKEN}" `
        + `-H "X-GitHub-Api-Version: 2022-11-28" `
        + `"${API}${path}"`
    return execSync(cmd, { encoding: 'utf8' }).trim()
}

for (const fullName of names) {
    const pkg = ghPackageName(fullName)
    const path = `/orgs/${ORG}/packages/npm/${encodeURIComponent(pkg)}`
    try {
        if (!WRITE) {
            // just check existence with a GET
            const code = api('GET', path)
            if (code === '200') { console.log(`  would delete  ${fullName}`); report.deleted.push(fullName) }
            else if (code === '404') { report.notFound.push(fullName) }
            else { console.log(`  ?? ${code}       ${fullName}`); report.failed.push({ name: fullName, code }) }
        }
        else {
            const code = api('DELETE', path)
            if (code === '204') { console.log(`  deleted       ${fullName}`); report.deleted.push(fullName) }
            else if (code === '404') { report.notFound.push(fullName) }
            else { console.error(`  FAILED ${code}  ${fullName}`); report.failed.push({ name: fullName, code }) }
        }
    }
    catch (err) {
        console.error(`  ERROR         ${fullName}: ${err.message}`)
        report.failed.push({ name: fullName, error: err.message })
    }
}

writeFileSync('scripts/delete-org-packages.report.json', JSON.stringify(report, null, 2) + '\n')
console.log('\n──────── summary ────────')
console.log(`${WRITE ? 'deleted' : 'to delete'} : ${report.deleted.length}`)
console.log(`not found     : ${report.notFound.length}`)
console.log(`failed        : ${report.failed.length}`)
console.log('report        : scripts/delete-org-packages.report.json')
if (report.failed.length) process.exit(1)
