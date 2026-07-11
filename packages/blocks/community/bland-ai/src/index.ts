import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { blandAiAuth, BLAND_AI_BASE_URL } from './lib/auth';
import { sendCall } from './lib/actions/send-call';
import { getCallDetails } from './lib/actions/get-call-details';
import { listCalls } from './lib/actions/list-calls';

export const blandAi = createBlock({
  displayName: 'Bland AI',
  description: 'AI phone calling platform for outbound and conversational voice workflows.',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/bland-ai.png',
  categories: [BlockCategory.COMMUNICATION],
  auth: blandAiAuth,
  authors: ['Harmatta'],
  actions: [
    sendCall,
    getCallDetails,
    listCalls,
    createCustomApiCallAction({
      auth: blandAiAuth,
      baseUrl: () => BLAND_AI_BASE_URL,
      authMapping: async (auth) => ({
        authorization: auth.secret_text,
      }),
    }),
  ],
  triggers: [],
});
