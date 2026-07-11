import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { denserAiAuth } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';
import { processInputText } from './lib/actions/process-input-text';

export const denserAi = createBlock({
  displayName: 'Denser.ai',
  auth: denserAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/denser-ai.png',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ['sanket-a11y'],
  actions: [processInputText],
  triggers: [],
});
