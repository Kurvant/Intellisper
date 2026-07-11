import { HttpMethod, createCustomApiCallAction, httpClient } from '@intelblocks/blocks-common';
import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { getFliqrAccountDetails } from './lib/actions/get-account-details';
import { fliqrConfig } from './lib/common/models';
import { getFliqrAccountFlows } from './lib/actions/get-account-flows';
import { BlockCategory } from '@intelblocks/shared';
import { fliqrAuth } from './lib/auth';

export const fliqrAi = createBlock({
  displayName: 'Fliqr AI',
  description:
    'Omnichannel AI chatbot enhancing customer interactions across WhatsApp, Facebook, Instagram, Telegram, and 6 other platforms.',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/fliqr-ai.png',
  authors: ["drona2938"],
  categories: [BlockCategory.COMMUNICATION,BlockCategory.CUSTOMER_SUPPORT,BlockCategory.MARKETING],
  auth: fliqrAuth,
  actions: [ getFliqrAccountDetails, 
    getFliqrAccountFlows,
    createCustomApiCallAction({
      baseUrl: () => fliqrConfig.baseUrl,
      auth: fliqrAuth,
      authMapping: async (auth) => ({
        [fliqrConfig.accessTokenHeaderKey]: `${auth}`,
      }),
    }),
  ],
  triggers: [],
});
