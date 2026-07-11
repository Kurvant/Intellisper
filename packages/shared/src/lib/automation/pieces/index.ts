export * from './dto/piece-requests'
export * from './piece'
export * from './utils'

export enum BlockSyncMode {
    // Sync from a configured registry host (IB_BLOCKS_REGISTRY_URL). The host
    // is operator-controlled — this edition ships no hardcoded Intellisper URL.
    OFFICIAL_AUTO = 'OFFICIAL_AUTO',
    // Resolve blocks from the public NPM registry / locally bundled blocks only.
    NPM = 'NPM',
    // No registry sync; blocks come from the local DB only. Default for this
    // edition so a fresh instance never makes an outbound block-registry call.
    NONE = 'NONE',
}

  