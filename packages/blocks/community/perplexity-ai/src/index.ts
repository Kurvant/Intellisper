import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createChatCompletionAction } from './lib/actions/create-chat-completion.action';
import { perplexityAiAuth } from './lib/auth';

export const perplexityAi = createBlock({
  displayName: 'Perplexity AI',
  auth: perplexityAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/perplexity-ai.png',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  description: 'AI powered search engine',
  authors: ['kishanprmr','AbdulTheActivePiecer'],
  actions: [createChatCompletionAction],
  triggers: [],
});
