// Side-effect entry: mirror legacy AP_* env vars to IB_* before anything reads
// configuration. Must be the FIRST import in main.ts so it runs before any
// module evaluates process.env at load time.
import { envPrefixCompat } from '@intelblocks/server-utils'

envPrefixCompat.installEnvPrefixCompat()
