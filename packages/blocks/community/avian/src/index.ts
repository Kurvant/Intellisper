import { createBlock } from '@intelblocks/blocks-framework';
import { askAvian } from './lib/actions/ask-avian';
import { BlockCategory } from '@intelblocks/shared';
import { avianAuth } from './lib/auth';

export const avian = createBlock({
  displayName: 'Avian',
  description: 'Integrate with Avian  to leverage its powerful language models for generating human-like text based on your prompts.',
  auth: avianAuth,
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/avian.png',
  authors: ['avianion'],
  actions: [askAvian],
  triggers: [],
});
