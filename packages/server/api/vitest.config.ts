import path from 'path'
import { defineConfig } from 'vitest/config'

// Change CWD to repo root for compatibility with piece-loader path resolution
const repoRoot = path.resolve(__dirname, '../../..')
process.chdir(repoRoot)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    include: [path.resolve(__dirname, 'test/**/*.test.ts')],
  },
  resolve: {
    alias: {
      'isolated-vm': path.resolve(__dirname, '__mocks__/isolated-vm.js'),
      '@intelblocks/shared': path.resolve(__dirname, '../../../packages/shared/src/index.ts'),
      '@intelblocks/blocks-framework': path.resolve(__dirname, '../../../packages/blocks/framework/src/index.ts'),
      '@intelblocks/blocks-common': path.resolve(__dirname, '../../../packages/blocks/common/src/index.ts'),
      '@intelblocks/server-utils': path.resolve(__dirname, '../../../packages/server/utils/src/index.ts'),

    },
  },
})
