#!/usr/bin/env node
/**
 * Independent verification (does NOT trust the writer script):
 * re-reads every tracked package.json and asserts that
 *   - EVERY @intelblocks/* package has publishConfig.registry = https://npm.pkg.github.com
 *   - NO non-@intelblocks package was given one
 *   - every file still parses as valid JSON
 *
 * Exit 0 = all good. Exit 1 = at least one problem (listed).
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const REGISTRY = 'https://npm.pkg.github.com'
const SCOPE = '@intelblocks/'

const files = execSync(`git ls-files "packages/**/package.json"`, { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)

let scoped = 0, ok = 0
const problems = []

for (const file of files) {
    let json
    try {
        json = JSON.parse(readFileSync(file, 'utf8'))
    }
    catch (e) {
        problems.push({ file, issue: `INVALID JSON: ${e.message}` })
        continue
    }
    const name = typeof json.name === 'string' ? json.name : ''
    const reg = json.publishConfig?.registry

    if (name.startsWith(SCOPE)) {
        scoped++
        if (reg === REGISTRY) {
            ok++
        }
        else {
            problems.push({ file, issue: `@intelblocks pkg missing/wrong registry (got: ${reg ?? 'none'})`, name })
        }
    }
    else if (reg !== undefined) {
        problems.push({ file, issue: `non-@intelblocks pkg unexpectedly has publishConfig.registry=${reg}`, name: name || '(no name)' })
    }
}

console.log('──────── verification ────────')
console.log(`package.json checked : ${files.length}`)
console.log(`@intelblocks packages: ${scoped}`)
console.log(`  correctly set      : ${ok}`)
console.log(`problems             : ${problems.length}`)

if (problems.length > 0) {
    console.error('\n❌ PROBLEMS:')
    for (const p of problems) console.error(`  ${p.file}\n      ${p.issue}`)
    process.exit(1)
}
console.log('\n✅ All @intelblocks packages point at GitHub Packages; no others were touched.')
