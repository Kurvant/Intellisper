import { BlockAuth } from '@intelblocks/blocks-framework';
import { httpClient, HttpMethod } from '@intelblocks/blocks-common';

export const krispcallAuth = BlockAuth.CustomAuth({
  props: {
    apiKey: BlockAuth.SecretText({
      displayName: 'API key',
      required: true,
    }),
  },
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest<string[]>({
        method: HttpMethod.GET,
        url: 'https://app.krispcall.com/api/v3/platform/activepiece/me',
        headers: {
          'X-API-KEY': auth.apiKey,
        },
      });
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  },
  required: true,
});
