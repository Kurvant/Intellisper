// Side-effect entry: mirror legacy AP_* env vars to IB_* before anything reads
// configuration. Must be the FIRST import in the engine's main.ts so it runs
// before any module (engine-constants static fields, ssrf-guard, worker-socket)
// evaluates process.env at load time.
//
// The engine is a lean, isolated sandbox process and intentionally does NOT
// depend on @intelblocks/server-utils, so this mirror is inlined here rather
// than imported. Keep it in sync with server-utils/env-normalize.ts.

const LEGACY_PREFIX = 'AP_'
const PREFIX = 'IB_'

for (const key of Object.keys(process.env)) {
    if (!key.startsWith(LEGACY_PREFIX)) {
        continue
    }
    const newKey = PREFIX + key.slice(LEGACY_PREFIX.length)
    const legacyValue = process.env[key]
    if (process.env[newKey] === undefined && legacyValue !== undefined) {
        process.env[newKey] = legacyValue
    }
}
