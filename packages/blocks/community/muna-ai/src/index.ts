import { createBlock } from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockCategory } from '@intelblocks/shared';
import { munaAiAuth } from './lib/auth';
import { createPrediction } from './lib/actions/create-prediction';

export const munaAi = createBlock({
  displayName: 'Muna',
  description: 'Run on-device AI predictions using Muna predictors.',
  auth: munaAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/muna-ai.png',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ['sanket-a11y'],
  actions: [
    createPrediction,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.muna.ai/v1',
      auth: munaAiAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [],
});
