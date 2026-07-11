#!/usr/bin/env node
/**
 * Build + prepare + publish @intelblocks/* packages to the configured registry
 * (GitHub Packages, per each package's publishConfig).
 *
 * Replicates the CLI's prepareBlockDistForPublish: after building, it rewrites the
 * COPIED dist/package.json so that `workspace:*` dependencies become the real
 * versions from the monorepo, and caret/tilde ranges are pinned. Publishing a raw
 * `workspace:*` spec produces a package that NO registry consumer can install — the
 * exact breakage we hit when publishing by hand.
 *
 * Safe by design:
 *   - dry-run by default; pass --write to actually `npm publish`
 *   - builds each package first (so dist/package.json is fresh)
 *   - per-package try/catch: one failure doesn't abort the batch
 *   - publishes in DEPENDENCY ORDER (foundation packages before blocks)
 *   - detailed per-step logging + a JSON report
 *
 * Usage:
 *   node scripts/publish-packages.mjs                       # dry-run, foundation set
 *   node scripts/publish-packages.mjs --write               # publish foundation set
 *   node scripts/publish-packages.mjs --write --all         # publish every @intelblocks pkg
 *   node scripts/publish-packages.mjs --write --only=@intelblocks/shared,@intelblocks/block-slack
 *
 * Requires (in the shell that runs it): a GitHub token available to npm, e.g.
 *   npm config set //npm.pkg.github.com/:_authToken=$GITHUB_TOKEN
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const WRITE = process.argv.includes('--write')
const ALL = process.argv.includes('--all')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '')
const ONLY_FAILED = process.argv.includes('--only-failed')
const REPORT_PATH = 'scripts/publish-packages.report.json'
const REGISTRY = 'https://npm.pkg.github.com'

// ---- workspace version map (mirrors cli/workspace-utils.buildWorkspaceVersionMap) ----
function buildWorkspaceVersionMap(rootDir) {
    const map = new Map()
    const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
    for (const pattern of rootPkg.workspaces ?? []) {
        if (pattern.endsWith('/*')) {
            const dir = join(rootDir, pattern.slice(0, -2))
            if (!existsSync(dir)) continue
            for (const entry of execSync(`git ls-files "${pattern.slice(0, -2)}/*/package.json"`, { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean)) {
                try {
                    const pkg = JSON.parse(readFileSync(entry, 'utf8'))
                    if (pkg.name) map.set(pkg.name, pkg.version)
                }
                catch { /* ignore unreadable */ }
            }
        }
        else {
            const p = join(rootDir, pattern, 'package.json')
            if (existsSync(p)) {
                const pkg = JSON.parse(readFileSync(p, 'utf8'))
                if (pkg.name) map.set(pkg.name, pkg.version)
            }
        }
    }
    return map
}

function isExactVersion(v) {
    return /^\d+(\.\d+){0,2}(-[\w.]+)?$/.test(v)
}

function resolveAndPin(deps, versionMap, pkgName) {
    if (!deps) return deps
    const out = {}
    for (const [name, version] of Object.entries(deps)) {
        let v = version
        if (v.startsWith('workspace:')) {
            const resolved = versionMap.get(name)
            if (!resolved) throw new Error(`${pkgName}: cannot resolve workspace dep ${name} (${version}) — not found in workspace`)
            v = resolved
        }
        const pinned = v.replace(/^[\^~]/, '')
        if (!isExactVersion(pinned)) throw new Error(`${pkgName}: unsupported version range for ${name}: "${version}"`)
        out[name] = pinned
    }
    return out
}

// ---- discover @intelblocks packages and their dist dirs ----
const root = process.cwd()
const versionMap = buildWorkspaceVersionMap(root)

const allPkgFiles = execSync('git ls-files "packages/**/package.json"', { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)

const packages = []
for (const file of allPkgFiles) {
    const json = JSON.parse(readFileSync(file, 'utf8'))
    if (!(json.name || '').startsWith('@intelblocks/')) continue
    packages.push({ name: json.name, version: json.version, dir: file.replace(/\/package\.json$/, '') })
}

// Foundation packages MUST publish before any block that depends on them.
const FOUNDATION = ['@intelblocks/shared', '@intelblocks/blocks-common', '@intelblocks/blocks-framework']
const foundationSet = new Set(FOUNDATION)

let selected
if (ONLY_FAILED) {
    // Re-read the last report and retry only the packages that failed. Foundation
    // packages, if present, are ordered first so dependents can resolve them.
    if (!existsSync(REPORT_PATH)) {
        console.error(`--only-failed: no prior report at ${REPORT_PATH}. Run a publish first.`)
        process.exit(1)
    }
    const prev = JSON.parse(readFileSync(REPORT_PATH, 'utf8'))
    const failedNames = new Set((prev.failed || []).map((f) => f.name))
    if (failedNames.size === 0) {
        console.log('--only-failed: previous run had 0 failures. Nothing to do.')
        process.exit(0)
    }
    const failedPkgs = packages.filter((p) => failedNames.has(p.name))
    const fFoundation = FOUNDATION.map((n) => failedPkgs.find((p) => p.name === n)).filter(Boolean)
    const fRest = failedPkgs.filter((p) => !foundationSet.has(p.name)).sort((a, b) => a.name.localeCompare(b.name))
    selected = [...fFoundation, ...fRest]
    console.log(`--only-failed: retrying ${selected.length} previously-failed package(s)`)
}
else if (ONLY) {
    const want = new Set(ONLY.split(',').map((s) => s.trim()))
    selected = packages.filter((p) => want.has(p.name))
}
else if (ALL) {
    // foundation first (in order), then everything else
    const rest = packages.filter((p) => !foundationSet.has(p.name)).sort((a, b) => a.name.localeCompare(b.name))
    selected = [...FOUNDATION.map((n) => packages.find((p) => p.name === n)).filter(Boolean), ...rest]
}
else {
    // default: foundation + slack as a proof set
    selected = [...FOUNDATION, '@intelblocks/block-slack'].map((n) => packages.find((p) => p.name === n)).filter(Boolean)
}

console.log(`mode: ${WRITE ? 'PUBLISH' : 'dry-run'} | packages selected: ${selected.length}\n`)

const report = { mode: WRITE ? 'publish' : 'dry-run', registry: REGISTRY, ok: [], skipped: [], failed: [] }

for (const pkg of selected) {
    try {
        console.log(`\n=== ${pkg.name}@${pkg.version} ===`)

        // 1) build (refreshes dist/ and copies package.json into it)
        console.log('  building…')
        execSync(`npx turbo run build --filter=${pkg.name}`, { stdio: 'pipe' })

        const distDir = join(pkg.dir, 'dist')
        const distPkgPath = join(distDir, 'package.json')
        if (!existsSync(distPkgPath)) throw new Error(`no dist/package.json at ${distPkgPath} (build did not copy it?)`)

        // 2) rewrite workspace:* -> real versions, pin ranges
        const distJson = JSON.parse(readFileSync(distPkgPath, 'utf8'))
        distJson.dependencies = resolveAndPin(distJson.dependencies, versionMap, pkg.name)
        distJson.devDependencies = resolveAndPin(distJson.devDependencies, versionMap, pkg.name)
        distJson.peerDependencies = resolveAndPin(distJson.peerDependencies, versionMap, pkg.name)
        if (!distJson.publishConfig || distJson.publishConfig.registry !== REGISTRY) {
            distJson.publishConfig = { ...(distJson.publishConfig || {}), registry: REGISTRY }
        }
        writeFileSync(distPkgPath, JSON.stringify(distJson, null, 2) + '\n')
        console.log(`  prepared deps: ${JSON.stringify(distJson.dependencies || {})}`)

        // 3) publish (or dry-run) from dist/
        const cmd = WRITE ? 'npm publish' : 'npm publish --dry-run'
        console.log(`  ${cmd} (cwd=${distDir})`)
        const out = execSync(cmd, { cwd: distDir, encoding: 'utf8', stdio: 'pipe' })
        const published = /\+\s+@intelblocks\//.test(out) || WRITE
        console.log(`  ${WRITE ? '✅ published' : 'ℹ️  dry-run ok'}`)
        report.ok.push({ name: pkg.name, version: pkg.version, published })
    }
    catch (err) {
        const msg = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '') || err.message
        // An immutable-version conflict means it's already published — not a failure.
        // Treat it as "skipped" so re-runs (and --only-failed) converge to 0 failures.
        if (/E409|409 Conflict|cannot publish over|already exists|EPUBLISHCONFLICT/i.test(msg)) {
            console.log(`  ⏭️  skipped (already published): ${pkg.name}@${pkg.version}`)
            report.skipped.push({ name: pkg.name, version: pkg.version })
        }
        else {
            console.error(`  ❌ FAILED: ${pkg.name}`)
            console.error('     ' + msg.split('\n').filter(Boolean).slice(-6).join('\n     '))
            report.failed.push({ name: pkg.name, version: pkg.version, error: msg.split('\n').slice(-6).join(' | ') })
        }
    }
}

writeFileSync('scripts/publish-packages.report.json', JSON.stringify(report, null, 2) + '\n')
console.log('\n──────── summary ────────')
console.log(`ok      : ${report.ok.length}`)
console.log(`skipped : ${report.skipped.length} (already published)`)
console.log(`failed  : ${report.failed.length}`)
console.log('report : scripts/publish-packages.report.json')
if (report.failed.length) {
    console.error('\n⚠️  some packages failed — see above.')
    process.exit(1)
}
console.log(WRITE ? '\n✅ done.' : '\nℹ️  dry-run only — re-run with --write to publish.')
