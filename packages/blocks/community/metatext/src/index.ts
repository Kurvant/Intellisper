import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { extractText } from './lib/actions/extract-text';
import { classifyText } from './lib/actions/classify-text';
import { finetuneModel } from './lib/actions/finetune-model';
import { metatextAuth } from './lib/auth';

export const metatext = createBlock({
  displayName: 'Metatext',
  description: 'AI content moderation and safety guard API',
  auth: metatextAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/metatext.png',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ['onyedikachi-david'],
  actions: [extractText, classifyText, finetuneModel],
  triggers: [],
});
