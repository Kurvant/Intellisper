import path from 'path'
import { defineConfig } from 'vitest/config'

const repoRoot = path.resolve(__dirname, '../../../..')

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@intelblocks/shared': path.resolve(repoRoot, 'packages/shared/src/index.ts'),
      '@intelblocks/blocks-framework': path.resolve(repoRoot, 'packages/blocks/framework/src/index.ts'),
      '@intelblocks/blocks-common': path.resolve(repoRoot, 'packages/blocks/common/src/index.ts'),
    },
  },
})
