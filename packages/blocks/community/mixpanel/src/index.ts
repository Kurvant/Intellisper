import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { trackEvent } from './lib/actions/track-event';
import { mixpanelAuth } from './lib/auth';

export const mixpanel = createBlock({
  displayName: 'Mixpanel',
  description: 'Simple and powerful product analytics that helps everyone make better decisions',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/mixpanel.png',
  authors: ["yann120","kishanprmr","MoShizzle","abuaboud"],
  auth: mixpanelAuth,
  categories: [BlockCategory.BUSINESS_INTELLIGENCE],
  actions: [
    trackEvent,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.mixpanel.com',
      auth: mixpanelAuth,
      authMapping: async (auth) => ({
        Authorization: `Basic ${Buffer.from(auth.secret_text).toString(
          'base64'
        )}`,
      }),
    }),
  ],
  triggers: [],
});
