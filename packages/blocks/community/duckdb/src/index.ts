import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';

import { createAndQueryDB } from './lib/actions/create-and-query-db';
import { BlockCategory } from '@intelblocks/shared';

export const duckdb = createBlock({
  displayName: 'DuckDB',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/duckdb.png',
  description: 'Run SQL queries on an in-memory DuckDB database.',
  categories: [BlockCategory.DEVELOPER_TOOLS],
  authors: ['danielpoonwj'],
  actions: [createAndQueryDB],
  triggers: [],
});
