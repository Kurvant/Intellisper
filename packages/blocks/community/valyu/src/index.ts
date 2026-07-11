import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { searchAction } from './lib/actions/search';
import { extractContentAction } from './lib/actions/extract-content';
import { answerAction } from './lib/actions/answer';
import { createDeepResearchTaskAction } from './lib/actions/create-deep-research-task';
import { createBatchAction } from './lib/actions/create-batch';
import { listDatasourcesAction } from './lib/actions/list-datasources';
import { createCustomApiCallAction, HttpMethod } from '@intelblocks/blocks-common';
import { makeRequest } from './lib/common';
import { valyuAuth } from './lib/auth';

export const valyu = createBlock({
  displayName: 'Valyu',
  description: 'Search the web, research papers, and proprietary datasets with intelligent query processing.',
  auth: valyuAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/valyu.png',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE, BlockCategory.PRODUCTIVITY],
  authors: ['onyedikachi-david'],
  actions: [
    searchAction,
    extractContentAction,
    answerAction,
    createDeepResearchTaskAction,
    createBatchAction,
    listDatasourcesAction,
    createCustomApiCallAction({
      auth: valyuAuth,
      baseUrl: () => 'https://api.valyu.ai',
      authMapping: async (auth) => ({
        'x-api-key': `${auth}`,
      }),
    }),
  ],
  triggers: [],
});