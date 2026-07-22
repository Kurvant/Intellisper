import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ENFORCEMENT GATE (plan §4.3 replacement for RLS): statically scans the browser-agent module and
 * FAILS the build if any file constructs a read against a browser-agent table without going
 * through the mandatory `agentScope` helper. This is the "you cannot forget the filter" guarantee.
 *
 * Heuristic: any file that references a browser-agent repository read (createQueryBuilder / findBy
 * / findOneBy / find( on an agent repo) MUST also import/use `agentScope`. The scope helper file
 * itself and the entity definitions are exempt. As services land in later phases they are held to
 * this rule automatically.
 */

const BROWSER_AGENT_DIR = join(__dirname, '../../../../src/app/browser-agent')

// Files that legitimately do not need agentScope (no data reads, or they ARE the helper).
const EXEMPT_SUFFIXES = [
    'scope/agent-scope.ts',
    '.entity.ts',
    'entities/index.ts',
    '.module.ts',
    '-health.controller.ts',
]

// Signals that a file performs a repository READ that must be scoped.
const READ_SIGNALS = [
    /\.createQueryBuilder\s*\(/,
    /\.findBy\s*\(/,
    /\.findOneBy\s*\(/,
    /\.find\s*\(\s*\{/,
    /\.findOne\s*\(\s*\{/,
]

/**
 * Explicit, DOCUMENTED opt-out for files whose reads are trusted-internal BY-PRIMARY-KEY lookups
 * driven by the queue/runtime (never a client request), where ownership was already enforced upstream
 * — e.g. a batch admission tick or the notifier resolving a batch by its own id. A file may skip the
 * `agentScope.` requirement ONLY by carrying a `// agentScope-exempt: <reason>` marker, so the escape
 * hatch is visible in the source and code review, and a SILENT omission still fails the gate.
 */
const EXEMPT_MARKER = /agentScope-exempt:\s*\S/

function walk(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) out.push(...walk(full))
        else if (name.endsWith('.ts')) out.push(full)
    }
    return out
}

function isExempt(path: string): boolean {
    const norm = path.replace(/\\/g, '/')
    return EXEMPT_SUFFIXES.some((s) => norm.endsWith(s))
}

describe('browser-agent scope-enforcement gate', () => {
    it('every repository read in the browser-agent module goes through agentScope', () => {
        const files = walk(BROWSER_AGENT_DIR).filter((f) => !isExempt(f))
        const offenders: string[] = []

        for (const file of files) {
            const src = readFileSync(file, 'utf8')
            const hasRead = READ_SIGNALS.some((re) => re.test(src))
            if (!hasRead) continue
            const usesScope = /agentScope\./.test(src)
            const exempt = EXEMPT_MARKER.test(src)
            if (!usesScope && !exempt) {
                offenders.push(file.replace(/\\/g, '/'))
            }
        }

        expect(
            offenders,
            `These browser-agent files perform a repository read without agentScope:\n${offenders.join('\n')}`,
        ).toEqual([])
    })
})
