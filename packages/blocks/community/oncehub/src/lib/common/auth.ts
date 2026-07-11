import { BlockAuth } from '@intelblocks/blocks-framework';
import { makeRequest } from './client';
import { HttpMethod } from '@intelblocks/blocks-common';

export const oncehubAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Oncehub API Key',
  required: true,
  validate: async ({ auth }) => {
    try {
      console.log('auth', auth);
      await makeRequest(auth, HttpMethod.GET, '/test');

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid API credentials',
      };
    }
  },
});
