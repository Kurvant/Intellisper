import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';

import { createAccountAction } from './lib/actions/create-account';
import { createSubscriptionAction } from './lib/actions/create-subscription';
import { getAccountAction } from './lib/actions/get-account';
import { listSubscriptionsAction } from './lib/actions/list-subscriptions';
import { recurlyAuth } from './lib/auth';

export const recurly = createBlock({
  displayName: 'Recurly',
  description:
    'Manage subscriptions, billing accounts, and recurring revenue with Recurly.',
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/recurly.png',
  categories: [BlockCategory.COMMERCE, BlockCategory.PAYMENT_PROCESSING],
  authors: ['veri5ied'],
  auth: recurlyAuth,
  actions: [
    createAccountAction,
    createSubscriptionAction,
    getAccountAction,
    listSubscriptionsAction,
    createCustomApiCallAction({
      auth: recurlyAuth,
      baseUrl: () => 'https://v3.recurly.com',
      authMapping: async (auth) => ({
        Accept: 'application/vnd.recurly.v2021-02-25',
        Authorization: `Basic ${Buffer.from(`${auth.secret_text}:`).toString('base64')}`,
      }),
    }),
  ],
  triggers: [],
});