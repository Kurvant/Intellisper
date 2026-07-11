import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { BlockAuth } from '@intelblocks/blocks-framework';
import { makeRequest } from './client';

export const tidelyAuth = BlockAuth.SecretText({
  displayName: 'Tidely API Key',
  description: 'Your Tidely API Key. Get it from your Tidely account settings.',
  required: true,
  validate: async (auth) => {
    try {
      await makeRequest(
        auth.auth,
        HttpMethod.GET,
        '/open-api/authentication/verifyAuth',
        {}
      );
      return {
        valid: true,
      };
    } catch (e) {
      return {
        valid: false,
        error: 'Invalid API Key',
      };
    }
  },
});
