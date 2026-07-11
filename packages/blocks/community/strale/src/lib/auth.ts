import { BlockAuth } from '@intelblocks/blocks-framework';
import {
  AuthenticationType,
  httpClient,
  HttpMethod,
} from '@intelblocks/blocks-common';

export const straleAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description:
    'Your Strale API key (starts with sk_live_). Get one free at https://strale.dev/signup — includes 2.00 EUR trial credits. Some actions (Search, Trust Profile) work without a key.',
  required: false,
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest({
        url: 'https://api.strale.io/v1/wallet/balance',
        method: HttpMethod.GET,
        authentication: {
          type: AuthenticationType.BEARER_TOKEN,
          token: auth,
        },
      });
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid API key.' };
    }
  },
});
