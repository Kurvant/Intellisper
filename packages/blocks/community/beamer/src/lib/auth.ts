import { BlockAuth } from '@intelblocks/blocks-framework';
import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { beamerCommon } from './common';

export const beamerAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'API key acquired from your Beamer settings',
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: `${beamerCommon.baseUrl}/ping`,
        headers: {
          'Beamer-Api-Key': `${auth}`,
        },
      })
      return {
        valid: true,
      };
    } catch (e) {
      return {
        valid: false,
        error: 'Invalid API key.',
      };
    }
  },
});
