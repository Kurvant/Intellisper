import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { sendReviewInvite } from './lib/actions/send-review-invite';
import { BlockCategory } from '@intelblocks/shared';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { cloutlyAuth } from './lib/auth';

export const cloutly = createBlock({
  displayName: 'Cloutly',
  description: 'Review Management Tool',
  auth: cloutlyAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/cloutly.svg',
  categories: [BlockCategory.MARKETING],
  authors: ['joshuaheslin'],
  actions: [
    sendReviewInvite,
    createCustomApiCallAction({
      baseUrl: () => {
        return 'https://app.cloutly.com/api/v1';
      },
      auth: cloutlyAuth,
      authMapping: async (auth) => ({
        'x-app': 'activepieces',
        'x-api-key': auth.secret_text,
      }),
    }),
  ],
  triggers: [],
});
