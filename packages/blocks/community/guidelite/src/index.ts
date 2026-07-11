import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { sendAPrompt } from './lib/actions/send-a-prompt';
import { newLeadSubmission } from './lib/triggers/new-lead-submission';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { guideliteAuth } from './lib/common/auth';
import { BASE_URL } from './lib/common/client';
import { BlockCategory } from '@intelblocks/shared';

export const guidelite = createBlock({
  displayName: 'GuideLite',
  auth: guideliteAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/guidelite.png',
  authors: ['sanket-a11y'],
  description:
    'GuideLite is a platform that helps organizations build and utilize AI assistants',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  actions: [
    sendAPrompt,
    createCustomApiCallAction({
      auth: guideliteAuth,
      baseUrl: () => BASE_URL,
      authMapping: async (auth) => {
        return {
          authorization: `Bearer ${auth.secret_text}`,
        };
      },
    }),
  ],
  triggers: [newLeadSubmission],
});
