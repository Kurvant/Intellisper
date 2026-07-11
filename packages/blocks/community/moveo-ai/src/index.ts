import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { moveoTriggers } from './lib/triggers';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { moveoAuth } from './lib/auth';

export const moveoAi = createBlock({
  displayName: 'Moveo',
  description: 'Moveo.AI is a conversational AI platform that powers the toughest conversations through GenAI agents, driving efficiency and financial outcomes.',
  auth: moveoAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/moveo-ai.png',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ['onyedikachi-david'],
  actions: [
    createCustomApiCallAction({
      auth: moveoAuth,
      baseUrl: () => 'https://api.moveo.ai/api/v1',
      authMapping: async (auth) => ({
        Authorization: `apikey ${auth.secret_text}`,
      }),
      props: {
        queryParams: {
          description: 'Most Moveo endpoints require account_slug as a query parameter.',
          defaultValue: {
            account_slug: '',
          },
        },
      },
    }),
  ],
  triggers: moveoTriggers,
});