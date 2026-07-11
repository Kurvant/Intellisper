// Brand-rebrand env-prefix compatibility shim (Intellisper/Intelblocks).
//
// The runtime configuration prefix was renamed AP_* -> IB_*. To avoid a hard,
// lockstep break for existing deployments (which still set AP_* variables), this
// normalizer runs once at process startup and mirrors every legacy AP_<NAME>
// variable to IB_<NAME> when the IB_ form is not already set. An explicitly set
// IB_* always wins over the legacy AP_* of the same name.
//
// After this runs, all code can read process.env.IB_* uniformly and existing
// AP_*-only deployments keep booting. A single deprecation warning lists the
// legacy names still in use so operators can migrate at their own pace.
//
// Idempotent: safe to call more than once (later calls find IB_* already set).

const LEGACY_PREFIX = 'AP_'
const PREFIX = 'IB_'

function normalizeEnvPrefix(env: NodeJS.ProcessEnv = process.env): string[] {
    const migratedLegacyNames: string[] = []

    for (const key of Object.keys(env)) {
        if (!key.startsWith(LEGACY_PREFIX)) {
            continue
        }
        const suffix = key.slice(LEGACY_PREFIX.length)
        const newKey = PREFIX + suffix
        const legacyValue = env[key]
        // Explicit IB_* wins; only backfill when the new name is unset.
        if (env[newKey] === undefined && legacyValue !== undefined) {
            env[newKey] = legacyValue
            migratedLegacyNames.push(key)
        }
    }

    return migratedLegacyNames
}

// Run the normalization and emit a one-time deprecation notice. Kept separate
// from the pure normalizer so tests can exercise the mapping without the log.
function installEnvPrefixCompat(env: NodeJS.ProcessEnv = process.env): void {
    const migrated = normalizeEnvPrefix(env)
    if (migrated.length > 0) {
        // console (not the app logger) — this runs before the logger exists.
        // eslint-disable-next-line no-console
        console.warn(
            `[env] Deprecated ${LEGACY_PREFIX}* configuration variables detected and mirrored to ${PREFIX}*: ` +
            `${migrated.sort().join(', ')}. ` +
            `The ${LEGACY_PREFIX} prefix is deprecated; rename these to ${PREFIX} before it is removed.`,
        )
    }
}

export const envPrefixCompat = {
    normalizeEnvPrefix,
    installEnvPrefixCompat,
    LEGACY_PREFIX,
    PREFIX,
}
