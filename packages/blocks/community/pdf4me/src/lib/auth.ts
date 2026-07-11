import { BlockAuth } from '@intelblocks/blocks-framework';
import { httpClient, HttpMethod } from '@intelblocks/blocks-common';

export const pdf4meAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: `To get your PDF4me API key:
1. Go to your [API Keys dashboard](https://dev.pdf4me.com/dashboard/#/api-keys/)
2. Sign in or create a free account if you don't have one
3. Copy your API key and paste it here`,
  required: true,
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: 'https://api.pdf4me.com/Profile/GetProfile',
        headers: { Authorization: auth },
      });
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: 'Invalid API key. Please check your credentials at dev.pdf4me.com/dashboard/#/api-keys/',
      };
    }
  },
});
