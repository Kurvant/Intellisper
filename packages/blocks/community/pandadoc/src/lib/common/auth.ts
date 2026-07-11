import { BlockAuth } from '@intelblocks/blocks-framework';
import { httpClient, HttpMethod } from '@intelblocks/blocks-common';

export const pandadocAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description:
    'Your PandaDoc API key. Get it from the Developer Dashboard in your PandaDoc account.',
  required: true,

  validate: async ({ auth }) => {
    try {
       await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: 'https://api.pandadoc.com/public/v1/documents',
        headers: {
          Authorization: `API-Key ${auth}`,
        },
      });

      return {
        valid: true,
      };
    } catch (error: any) {
      return {
        valid: false,
        error: `Authentication failed: ${
          error?.response?.data?.detail || error.message
        }`,
      };
    }
  },
});
