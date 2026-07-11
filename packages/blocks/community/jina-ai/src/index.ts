import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import {
  extractWebpageContentAction,
  webSearchSummarizationAction,
  deepSearchQueryAction,
  classifyContentAction,
  trainCustomClassifierAction
} from './lib/actions';
import { jinaAiAuth } from './lib/auth';

const markdownDescription = `
You can get your API key from [Jina AI](https://jina.ai).
`;

export const jinaAi = createBlock({
  displayName: 'Jina AI',
  description: 'AI-powered web content extraction, search, and classification',
  auth: jinaAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/jinaai.jpeg',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ['denieler'],
  actions: [
    extractWebpageContentAction,
    webSearchSummarizationAction,
    deepSearchQueryAction,
    classifyContentAction,
    trainCustomClassifierAction,
  ],
  triggers: [],
});