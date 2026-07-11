import { BlockAuth } from '@intelblocks/blocks-framework';
import { HttpMethod } from '@intelblocks/blocks-common';
import { closeApiCall } from './common/client';

export const closeAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Your Close CRM API key for authentication.',
  required: true,
  validate: async ({ auth }) => {
    try {
      await closeApiCall({
        accessToken: auth,
        method: HttpMethod.GET,
        resourceUri: '/me/',
      });

      return { valid: true };
    } catch {
      return {
        valid: false,
        error: 'Invalid API key.',
      };
    }
  },
});
