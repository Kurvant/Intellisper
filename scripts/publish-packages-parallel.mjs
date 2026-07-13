#!/usr/bin/env node
/**
 * PARALLEL publisher for @intelblocks/* packages -> GitHub Packages.
 *
 * Why this exists: publish-packages.mjs is sequential AND spawns a fresh
 * `npx turbo run build --filter=<pkg>` per package (~30-90s of cold startup each),
 * which across ~748 packages takes days. This version:
 *
 *   1. STATUS CHECK — fetches each package's packument straight from the registry
 *      over HTTP (Node fetch, 30 concurrent). No npm CLI spawns. ~748 packages in
 *      a few seconds. Anything already published at its current version is skipped
 *      before any build happens.
 *   2. BUILD — one turbo invocation per CHUNK of 60 packages (turbo parallelizes
 *      internally and caches; chunking keeps the Windows command line under limits).
 *      `--continue` so one broken package doesn't sink the batch.
 *   3. PREPARE — rewrites every dist/package.json in a single synchronous pass:
 *      workspace:* -> pinned real versions, ^/~ stripped, main/types/exports
 *      stripped of the leading dist/ (the tarball root IS dist), registry forced.
 *   4. PUBLISH — a concurrency pool (default 8) of `npm publish` child processes.
 *      Foundation packages (shared, blocks-common, blocks-framework) go first,
 *      sequentially, because everything depends on them.
 *
 * Safe by design: dry-run by default (--write to publish), E409/already-published
 * counted as skipped, incremental report after every result, re-runnable.
 *
 * Usage:
 *   node scripts/publish-packages-parallel.mjs                # dry-run, everything
 *   node scripts/publish-packages-parallel.mjs --write        # publish everything missing
 *   node scripts/publish-packages-parallel.mjs --write --concurrency=12
 *   node scripts/publish-packages-parallel.mjs --write --only=@intelblocks/block-slack
 *
 * Auth: GITHUB_TOKEN env var, or falls back to the token in your npm userconfig
 * (//npm.pkg.github.com/:_authToken). npm publish itself uses the npm config.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync, exec } from 'node:child_process'
import { join } from 'node:path'

const WRITE = process.argv.includes('--write')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '')
const CONCURRENCY = Number((process.argv.find((a) => a.startsWith('--concurrency=')) || '').replace('--concurrency=', '')) || 8
const STATUS_CONCURRENCY = 30
const BUILD_CHUNK = 60
const REGISTRY = 'https://npm.pkg.github.com'
const REPORT_PATH = 'scripts/publish-packages-parallel.report.json'
const FOUNDATION = ['@intelblocks/shared', '@intelblocks/blocks-common', '@intelblocks/blocks-framework']

// ---------- auth ----------
function getToken() {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    // npm >=10 refuses `npm config get` for auth tokens, so read the userconfig
    // .npmrc directly. The token never leaves this process.
    try {
        const userconfig = execSync('npm config get userconfig', { encoding: 'utf8' }).trim()
        const rc = readFileSync(userconfig, 'utf8')
        const m = rc.match(/\/\/npm\.pkg\.github\.com\/:_authToken=(.+)/)
        if (m) {
            const t = m[1].trim()
            if (t && !t.startsWith('$')) return t
        }
    }
    catch { /* fall through */ }
    return null
}
const TOKEN = getToken()
if (!TOKEN) {
    console.error('No registry token found (GITHUB_TOKEN env or npm userconfig). Status checks and publish will fail.')
    process.exit(1)
}

// ---------- discovery ----------
const pkgFiles = execSync('git ls-files "packages/**/package.json"', { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)

const packages = []
for (const file of pkgFiles) {
    const json = JSON.parse(readFileSync(file, 'utf8'))
    if (!(json.name || '').startsWith('@intelblocks/')) continue
    packages.push({ name: json.name, version: json.version, dir: file.replace(/\/package\.json$/, '') })
}

let candidates = packages
if (ONLY) {
    const want = new Set(ONLY.split(',').map((s) => s.trim()))
    candidates = packages.filter((p) => want.has(p.name))
}
console.log(`mode: ${WRITE ? 'PUBLISH' : 'dry-run'} | packages: ${candidates.length} | publish concurrency: ${CONCURRENCY}`)

// ---------- generic concurrency pool ----------
async function pool(items, limit, fn) {
    const results = new Array(items.length)
    let next = 0
    async function worker() {
        while (next < items.length) {
            const i = next++
            results[i] = await fn(items[i], i)
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
    return results
}

// ---------- 1. FAST status check (concurrent HTTP, no npm spawns) ----------
console.log('\n[1/4] checking registry status…')
const t0 = Date.now()
const statuses = await pool(candidates, STATUS_CONCURRENCY, async (pkg) => {
    try {
        const res = await fetch(`${REGISTRY}/${encodeURIComponent(pkg.name)}`, {
            headers: { Authorization: `Bearer ${TOKEN}` },
        })
        if (res.status === 404) return { pkg, published: false }
        if (!res.ok) return { pkg, published: false, statusError: res.status }
        const doc = await res.json()
        return { pkg, published: Boolean(doc.versions && doc.versions[pkg.version]) }
    }
    catch (err) {
        return { pkg, published: false, statusError: err.message }
    }
})
const alreadyPublished = statuses.filter((s) => s.published).map((s) => s.pkg)
const statusErrors = statuses.filter((s) => s.statusError)
const toPublish = statuses.filter((s) => !s.published).map((s) => s.pkg)
console.log(`  checked ${candidates.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s — already published: ${alreadyPublished.length}, to publish: ${toPublish.length}${statusErrors.length ? `, status errors: ${statusErrors.length}` : ''}`)
if (statusErrors.length) console.log('  (status errors are treated as "not published" and retried through publish)')

if (toPublish.length === 0) {
    console.log('\nNothing to publish. ✅')
    process.exit(0)
}

if (process.argv.includes('--status-only')) {
    console.log('\n--status-only: stopping after the registry check. Remaining packages:')
    for (const p of toPublish) console.log(`  ${p.name}@${p.version}`)
    process.exit(0)
}

// ---------- 2. BUILD in chunked turbo invocations ----------
console.log(`\n[2/4] building ${toPublish.length} packages (turbo, chunks of ${BUILD_CHUNK})…`)
const buildFailures = new Set()
for (let i = 0; i < toPublish.length; i += BUILD_CHUNK) {
    const chunk = toPublish.slice(i, i + BUILD_CHUNK)
    const filters = chunk.map((p) => `--filter=${p.name}`).join(' ')
    const label = `chunk ${1 + i / BUILD_CHUNK}/${Math.ceil(toPublish.length / BUILD_CHUNK)} (${chunk.length} pkgs)`
    try {
        console.log(`  building ${label}…`)
        execSync(`npx turbo run build --continue ${filters}`, { stdio: 'pipe' })
    }
    catch {
        // --continue means some built, some failed; identify failures by missing dist output.
        console.log(`  ${label}: some builds failed — identifying below`)
    }
    for (const p of chunk) {
        if (!existsSync(join(p.dir, 'dist', 'package.json'))) buildFailures.add(p.name)
    }
}
if (buildFailures.size) console.log(`  build failures: ${buildFailures.size} (excluded from publish, listed in report)`)

// ---------- 3. PREPARE all dist/package.json in one pass ----------
console.log('\n[3/4] preparing dist/package.json files…')
function buildWorkspaceVersionMap() {
    const map = new Map()
    for (const p of packages) map.set(p.name, p.version)
    // include non-@intelblocks workspace packages too (api, worker, web) for completeness
    for (const file of pkgFiles) {
        const json = JSON.parse(readFileSync(file, 'utf8'))
        if (json.name) map.set(json.name, json.version)
    }
    return map
}
const versionMap = buildWorkspaceVersionMap()
const isExactVersion = (v) => /^\d+(\.\d+){0,2}(-[\w.]+)?$/.test(v)
function resolveAndPin(deps, pkgName) {
    if (!deps) return deps
    const out = {}
    for (const [name, version] of Object.entries(deps)) {
        let v = version
        if (v.startsWith('workspace:')) {
            const resolved = versionMap.get(name)
            if (!resolved) throw new Error(`${pkgName}: cannot resolve workspace dep ${name}`)
            v = resolved
        }
        const pinned = v.replace(/^[\^~]/, '')
        if (!isExactVersion(pinned)) throw new Error(`${pkgName}: unsupported version range for ${name}: "${version}"`)
        out[name] = pinned
    }
    return out
}
const stripDist = (v) => (typeof v === 'string' ? v.replace(/^\.?\/?dist\//, './') : v)
function fixExports(node) {
    if (typeof node === 'string') return stripDist(node)
    if (node && typeof node === 'object') {
        const out = {}
        for (const [k, val] of Object.entries(node)) out[k] = fixExports(val)
        return out
    }
    return node
}

const prepFailures = new Map()
const ready = []
for (const pkg of toPublish) {
    if (buildFailures.has(pkg.name)) continue
    try {
        const distPkgPath = join(pkg.dir, 'dist', 'package.json')
        const j = JSON.parse(readFileSync(distPkgPath, 'utf8'))
        j.dependencies = resolveAndPin(j.dependencies, pkg.name)
        j.devDependencies = resolveAndPin(j.devDependencies, pkg.name)
        j.peerDependencies = resolveAndPin(j.peerDependencies, pkg.name)
        if (j.main) j.main = stripDist(j.main)
        if (j.types) j.types = stripDist(j.types)
        if (j.typings) j.typings = stripDist(j.typings)
        if (j.module) j.module = stripDist(j.module)
        if (j.exports) j.exports = fixExports(j.exports)
        j.publishConfig = { ...(j.publishConfig || {}), registry: REGISTRY }
        writeFileSync(distPkgPath, JSON.stringify(j, null, 2) + '\n')
        ready.push(pkg)
    }
    catch (err) {
        prepFailures.set(pkg.name, err.message)
    }
}
console.log(`  prepared: ${ready.length}${prepFailures.size ? `, prep failures: ${prepFailures.size}` : ''}`)

// ---------- 4. PUBLISH: foundation sequentially, the rest in a pool ----------
const report = {
    mode: WRITE ? 'publish' : 'dry-run', registry: REGISTRY,
    alreadyPublished: alreadyPublished.map((p) => `${p.name}@${p.version}`),
    ok: [], skipped: [], failed: [],
}
for (const name of buildFailures) report.failed.push({ name, error: 'build failed (no dist output)' })
for (const [name, error] of prepFailures) report.failed.push({ name, error: `prepare failed: ${error}` })
const saveReport = () => writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n')
saveReport()

function publishOne(pkg) {
    return new Promise((resolve) => {
        const cmd = WRITE ? 'npm publish' : 'npm publish --dry-run'
        exec(cmd, { cwd: join(pkg.dir, 'dist'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
            const msg = `${stdout || ''}${stderr || ''}`
            if (!err) {
                console.log(`  ✅ ${WRITE ? 'published' : 'dry-run ok'}  ${pkg.name}@${pkg.version}`)
                report.ok.push({ name: pkg.name, version: pkg.version })
            }
            else if (/E409|409 Conflict|cannot publish over|already exists|EPUBLISHCONFLICT/i.test(msg)) {
                console.log(`  ⏭️  already published  ${pkg.name}@${pkg.version}`)
                report.skipped.push({ name: pkg.name, version: pkg.version })
            }
            else {
                const tail = msg.split('\n').filter(Boolean).slice(-4).join(' | ')
                console.error(`  ❌ FAILED  ${pkg.name}: ${tail}`)
                report.failed.push({ name: pkg.name, version: pkg.version, error: tail })
            }
            saveReport()
            resolve()
        })
    })
}

const foundationReady = FOUNDATION.map((n) => ready.find((p) => p.name === n)).filter(Boolean)
const rest = ready.filter((p) => !FOUNDATION.includes(p.name))

console.log(`\n[4/4] publishing — foundation first (${foundationReady.length}), then ${rest.length} at concurrency ${CONCURRENCY}…`)
for (const pkg of foundationReady) await publishOne(pkg)   // sequential: everything depends on these
await pool(rest, CONCURRENCY, publishOne)

console.log('\n──────── summary ────────')
console.log(`already published (pre-check) : ${report.alreadyPublished.length}`)
console.log(`ok                            : ${report.ok.length}`)
console.log(`skipped (publish conflict)    : ${report.skipped.length}`)
console.log(`failed                        : ${report.failed.length}`)
console.log(`report                        : ${REPORT_PATH}`)
if (report.failed.length) {
    console.error('\n⚠️  some packages failed — re-run this script; the fast status check makes retries cheap.')
    process.exit(1)
}
console.log(WRITE ? '\n✅ done.' : '\nℹ️  dry-run only — re-run with --write to publish.')
