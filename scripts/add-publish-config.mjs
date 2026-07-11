#!/usr/bin/env node
/**
 * Adds `publishConfig.registry = https://npm.pkg.github.com` to every package.json
 * whose "name" starts with "@intelblocks/".
 *
 * Safe by design:
 *   - per-file try/catch: one bad file never aborts the run
 *   - detailed logging: every file is classified (updated / skipped / already / error)
 *   - dry-run by default; pass --write to actually modify files
 *   - preserves each file's existing indentation and trailing newline
 *   - writes a JSON report to scripts/add-publish-config.report.json
 *
 * Usage:
 *   node scripts/add-publish-config.mjs            # dry run, changes nothing
 *   node scripts/add-publish-config.mjs --write    # apply changes
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const REGISTRY = 'https://npm.pkg.github.com'
const SCOPE = '@intelblocks/'
const WRITE = process.argv.includes('--write')

// Detect indentation ("  " vs "\t") from the file so we don't reformat it.
function detectIndent(text) {
    const m = text.match(/\n([ \t]+)"/)
    return m ? m[1] : '  '
}

// List tracked package.json files under packages/ (avoids node_modules, dist, etc.).
let files
try {
    files = execSync(`git ls-files "packages/**/package.json"`, { encoding: 'utf8' })
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
}
catch (e) {
    console.error('FATAL: could not list files via git ls-files:', e.message)
    process.exit(1)
}

const report = { mode: WRITE ? 'write' : 'dry-run', registry: REGISTRY, total: files.length, updated: [], already: [], skippedNotScoped: [], errors: [] }

for (const file of files) {
    try {
        const raw = readFileSync(file, 'utf8')
        let json
        try {
            json = JSON.parse(raw)
        }
        catch (parseErr) {
            report.errors.push({ file, stage: 'parse', message: parseErr.message })
            console.error(`  ERROR  parse    ${file}\n           ${parseErr.message}`)
            continue
        }

        const name = typeof json.name === 'string' ? json.name : ''
        if (!name.startsWith(SCOPE)) {
            report.skippedNotScoped.push({ file, name: name || '(no name)' })
            continue
        }

        if (json.publishConfig && json.publishConfig.registry === REGISTRY) {
            report.already.push({ file, name })
            console.log(`  ok     already  ${name}`)
            continue
        }

        json.publishConfig = { ...(json.publishConfig || {}), registry: REGISTRY }

        if (WRITE) {
            const indent = detectIndent(raw)
            const trailingNewline = raw.endsWith('\n') ? '\n' : ''
            writeFileSync(file, JSON.stringify(json, null, indent) + trailingNewline)
        }
        report.updated.push({ file, name })
        console.log(`  ${WRITE ? 'wrote ' : 'would '} update   ${name}`)
    }
    catch (err) {
        report.errors.push({ file, stage: 'io', message: err.message })
        console.error(`  ERROR  io       ${file}\n           ${err.message}`)
    }
}

writeFileSync('scripts/add-publish-config.report.json', JSON.stringify(report, null, 2) + '\n')

console.log('\n──────── summary ────────')
console.log(`mode              : ${report.mode}`)
console.log(`package.json files: ${report.total}`)
console.log(`@intelblocks pkgs : ${report.updated.length + report.already.length}`)
console.log(`  updated         : ${report.updated.length}`)
console.log(`  already correct : ${report.already.length}`)
console.log(`skipped (unscoped): ${report.skippedNotScoped.length}`)
console.log(`ERRORS            : ${report.errors.length}`)
console.log('report            : scripts/add-publish-config.report.json')

if (report.errors.length > 0) {
    console.error('\n⚠️  completed WITH ERRORS — see the list above and the report file.')
    process.exit(2)
}
console.log(WRITE ? '\n✅ done.' : '\nℹ️  dry run only — re-run with --write to apply.')
