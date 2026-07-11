// Side-effect entry: mirror legacy AP_* env vars to IB_* before anything reads
// configuration. Must be the FIRST import in index.ts so it runs before
// ./lib/main (which reads worker config at module load).
import { envPrefixCompat } from '@intelblocks/server-utils'

envPrefixCompat.installEnvPrefixCompat()
