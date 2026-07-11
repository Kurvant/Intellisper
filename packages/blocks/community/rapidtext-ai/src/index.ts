import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { generateArticleAction } from './lib/actions/generate-article';
import { sendPromptAction } from './lib/actions/send-prompt';
import { rapidTextAiAuth } from './lib/common/auth';

export const rapidtextAi = createBlock({
  displayName: 'RapidText AI',
  auth: rapidTextAiAuth,
  minimumSupportedRelease: '0.36.1',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  logoUrl: 'https://cdn.activepieces.com/pieces/rapidtext-ai.png',
  authors: ['kishanprmr'],
  actions: [generateArticleAction, sendPromptAction],
  triggers: [],
});
