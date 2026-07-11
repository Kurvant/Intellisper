import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { roeAiAuth } from './lib/common/auth';
import { runQuery } from './lib/actions/run-query';
import { runAgent } from './lib/actions/run-agent';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { auth } from '@modelcontextprotocol/sdk/client/auth';

export const roeAi = createBlock({
  displayName: 'Roe AI',
  auth: roeAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/roe-ai.png',
  authors: ['sanket-a11y'],
  actions: [
    runAgent,
    runQuery,
    createCustomApiCallAction({
      auth: roeAiAuth,
      baseUrl: () => 'https://api.roe-ai.com/v1',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth.props.apiKey}`,
        };
      },
    }),
  ],
  triggers: [],
});
