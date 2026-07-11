import { BlockAuth } from '@intelblocks/blocks-framework';
import {
  AuthenticationType,
  httpClient,
  HttpMethod,
} from '@intelblocks/blocks-common';
import { BASE_URL } from './constants';

export const katanaAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: `
To generate your API key:

1. Log in to your Katana account
2. Go to **Settings > API**
3. Select **Add new API key**
4. Copy and paste the key here
`,
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: `${BASE_URL}/products`,
        authentication: {
          type: AuthenticationType.BEARER_TOKEN,
          token: auth,
        },
      });

      return {
        valid: true,
      };
    } catch {
      return {
        valid: false,
        error: 'Invalid API Key',
      };
    }
  },
});

