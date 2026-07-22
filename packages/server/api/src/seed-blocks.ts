/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports */
// Uses require() instead of import so dotenv populates process.env before any
// module-level code reads it, mirroring bootstrap.ts.
export {}

const { existsSync } = require('fs')
const nodePath = require('path')

// Prefer .env (what a local/self-hosted instance uses); fall back to .env.dev.
const repoRoot = nodePath.resolve(__dirname, '../../../..')
const envPath = [nodePath.join(repoRoot, '.env'), nodePath.join(repoRoot, '.env.dev')].find(existsSync)
if (envPath) {
    require('dotenv').config({ path: envPath })
}
require('./seed-blocks-main')
