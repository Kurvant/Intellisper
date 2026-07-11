import { BlockAuth } from '@intelblocks/blocks-framework';
import { HttpMethod } from '@intelblocks/blocks-common';
import { makeRequest } from './client';
import { AppConnectionType } from '@intelblocks/shared';

export const SoftrAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: `You can obtain your API key from [API Settings](https://studio.softr.io/user/apisettings).`,
  required: true,
  validate: async ({ auth }) => {
    if (auth) {
      try {
        await makeRequest({
          secret_text: auth,
          type: AppConnectionType.SECRET_TEXT,
        }, HttpMethod.GET, '/databases');
        return {
          valid: true,
        };
      } catch (error) {
        return {
          valid: false,
          error: 'Invalid API Key',
        };
      }
    }
    return {
      valid: false,
      error: 'Invalid API Key',
    };
  },
});
