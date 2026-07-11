import path from 'path'
import { defineConfig } from 'vitest/config'
const apiDir = __dirname
const repoRoot = path.resolve(__dirname, '../../..')
process.chdir(repoRoot)
const toPosix = (p) => p.split(path.sep).join('/')
export default defineConfig({
  test: { globals: true, environment: 'node', testTimeout: 120000, hookTimeout: 120000, pool: 'forks',
    setupFiles: [path.resolve(apiDir, 'vitest.setup.ts')],
    include: (process.env.WINRUN_INCLUDE
      ? process.env.WINRUN_INCLUDE.split(',')
      : [
        'test/integration/cloud/core/authorization-v2-project.test.ts',
        'test/integration/cloud/project-role/**/*.test.ts',
        'test/integration/cloud/project-members/**/*.test.ts',
        'test/integration/cloud/mcp/mcp-rbac.test.ts',
        'test/integration/cloud/tables/field-rbac.test.ts',
        'test/integration/cloud/tables/record-rbac.test.ts',
      ]).map((p) => toPosix(path.resolve(apiDir, p.trim()))) },
  resolve: { alias: {
    'isolated-vm': path.resolve(apiDir, '__mocks__/isolated-vm.js'),
    '@intelblocks/shared': path.resolve(apiDir, '../../../packages/shared/src/index.ts'),
    '@intelblocks/blocks-framework': path.resolve(apiDir, '../../../packages/blocks/framework/src/index.ts'),
    '@intelblocks/blocks-common': path.resolve(apiDir, '../../../packages/blocks/common/src/index.ts'),
    '@intelblocks/server-utils': path.resolve(apiDir, '../../../packages/server/utils/src/index.ts'),
  } },
})
