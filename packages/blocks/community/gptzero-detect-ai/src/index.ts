import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { scanFile } from './lib/actions/scan-file';
import { scanText } from './lib/actions/scan-text';
import { BlockCategory } from '@intelblocks/shared';
import { gptzeroDetectAiAuth } from './lib/common/auth';

export const gptzeroDetectAi = createBlock({
  displayName: 'GPTZero',
  auth: gptzeroDetectAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/gptzero-detect-ai.png',
  authors: ['sanket-a11y'],
  description: 'Detect AI-generated text with GPTZero API',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  actions: [scanFile, scanText],
  triggers: [],
});
