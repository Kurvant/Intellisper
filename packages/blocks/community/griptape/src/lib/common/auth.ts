import { HttpMethod } from '@intelblocks/blocks-common';
import { BlockAuth } from '@intelblocks/blocks-framework';
import { makeRequest } from './client';

export const griptapeAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: '',
  required: true,
  validate: async ({ auth }) => {
    try {
      await makeRequest(auth, HttpMethod.GET, `/organizations`);
      return {
        valid: true,
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid API key. Please check your Griptape Cloud API key.',
      };
    }
  },
});
