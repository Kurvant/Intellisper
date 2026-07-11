import { BlockAuth } from '@intelblocks/blocks-framework';
import { HttpMethod, httpClient } from '@intelblocks/blocks-common';

export const parserExpertAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Your Parser Expert API key. You can find this in your dashboard under Integration -> New API Key.',
  required: true,
  validate: async ({ auth }) => {
    if (!auth) {
      return {
        valid: false,
        error: 'API key is required',
      };
    }

    try {
      return {
        valid: true,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: 'Invalid API key. Please check your API key and try again.',
      };
    }
  },
});

