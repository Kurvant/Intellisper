import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { pendoAuth } from './lib/auth';
import { trackEvent } from './lib/actions/track-event';
import { getVisitor } from './lib/actions/get-visitor';
import { getAccount } from './lib/actions/get-account';
import { listGuides } from './lib/actions/list-guides';

export const pendo = createBlock({
  displayName: 'Pendo',
  description: 'Product analytics and digital adoption platform',
  auth: pendoAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/pendo.png',
  categories: [BlockCategory.BUSINESS_INTELLIGENCE],
  authors: ['Harmatta'],
  actions: [
    trackEvent,
    getVisitor,
    getAccount,
    listGuides,
    createCustomApiCallAction({
      baseUrl: () => 'https://app.pendo.io/api/v1',
      auth: pendoAuth,
      authMapping: async (auth) => ({
        'x-pendo-integration-key': String(auth),
      }),
    }),
  ],
  triggers: [],
});
