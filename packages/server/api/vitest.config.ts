import path from 'path'
import { defineConfig } from 'vitest/config'

// Change CWD to repo root for compatibility with piece-loader path resolution
const repoRoot = path.resolve(__dirname, '../../..')
process.chdir(repoRoot)

/**
 * Absolute path as a GLOB pattern.
 *
 * `path.resolve` emits the platform separator, so on Windows it returns backslashes — and a glob
 * matcher (picomatch/tinyglobby) reads `\` as an ESCAPE character, not a separator. An `include`
 * built with raw `path.resolve` therefore matches ZERO files on Windows, and the whole suite is
 * silently "no test files found" rather than failing loudly. Forward slashes are valid globs on
 * every platform, including Windows, so normalising here is correct everywhere and changes nothing
 * on POSIX.
 *
 * Only patterns need this. `setupFiles` and the resolve aliases are real filesystem paths, not
 * globs, so they stay as `path.resolve`.
 */
const globPath = (...segments: string[]): string =>
  path.resolve(__dirname, ...segments).replace(/\\/g, '/')

export default defineConfig({
  test: {
    /**
     * Vitest resolves CLI filters (`vitest run test/unit`) against `root`. Without this it defaults
     * to `process.cwd()` — which the chdir above has just moved to the repo root — so every
     * package script's `test/...` filter resolved to a non-existent path and matched nothing.
     * Pinning root to this package makes those filters mean what they plainly say, while the
     * process CWD stays at the repo root for the piece-loader.
     */
    root: __dirname,
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    include: [globPath('test/**/*.test.ts')],
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
