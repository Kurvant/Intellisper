import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: [path.resolve(__dirname, 'test/**/*.test.ts')],
    exclude: [path.resolve(__dirname, 'test/e2e/**')],
  },
  resolve: {
    alias: {
      '@intelblocks/shared': path.resolve(__dirname, '../../../packages/shared/src/index.ts'),
      '@intelblocks/blocks-framework': path.resolve(__dirname, '../../../packages/blocks/framework/src/index.ts'),
      '@intelblocks/server-utils': path.resolve(__dirname, '../../../packages/server/utils/src/index.ts'),
    },
  },
})
