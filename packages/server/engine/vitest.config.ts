import path from 'path'
import { defineConfig } from 'vitest/config'

// Change CWD to repo root for compatibility with piece-loader path resolution
const repoRoot = path.resolve(__dirname, '../../..')
process.chdir(repoRoot)

process.env.IB_EXECUTION_MODE = 'UNSANDBOXED'
process.env.IB_BASE_CODE_DIRECTORY = 'packages/server/engine/test/resources/codes'
process.env.IB_TEST_MODE = 'true'
process.env.IB_DEV_BLOCKS = 'http,data-mapper,approval,webhook,delay'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    include: [path.resolve(__dirname, 'test/**/*.test.ts')],
  },
  resolve: {
    alias: {
      '@intelblocks/shared': path.resolve(__dirname, '../../../packages/shared/src/index.ts'),
      '@intelblocks/blocks-framework': path.resolve(__dirname, '../../../packages/blocks/framework/src/index.ts'),
      '@intelblocks/blocks-common': path.resolve(__dirname, '../../../packages/blocks/common/src/index.ts'),
    },
  },
})
