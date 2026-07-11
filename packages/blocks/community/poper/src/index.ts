import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { newLead } from './lib/triggers/new-lead';
import { BlockCategory } from '@intelblocks/shared';

export const poper = createBlock({
  displayName: 'Poper',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.30.0',
  categories: [BlockCategory.MARKETING],
  description:
    'AI Driven Pop-up Builder that can convert visitors into customers,increase subscriber count, and skyrocket sales.',
  logoUrl: 'https://cdn.activepieces.com/pieces/poper.png',
  authors: ['thirstycode'],
  actions: [],
  triggers: [newLead],
});
