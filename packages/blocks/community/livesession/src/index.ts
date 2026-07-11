import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { livesessionAuth } from './lib/common/auth';
import { sessionEvent } from './lib/triggers/session-event';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockCategory } from '@intelblocks/shared';

export const livesession = createBlock({
  displayName: 'LiveSession',
  auth: livesessionAuth,
  minimumSupportedRelease: '0.36.1',
  description:
    'LiveSession is the analytics platform that helps businesses scale up based on data.',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  logoUrl: 'https://cdn.activepieces.com/pieces/livesession.png',
  authors: ['sanket-a11y'],
  actions: [
    createCustomApiCallAction({
      auth: livesessionAuth,
      baseUrl: () => 'https://api.livesession.io/v1',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth.secret_text}`,
        };
      },
    }),
  ],
  triggers: [sessionEvent],
});
