import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { BlockAuth } from '@intelblocks/blocks-framework';

export const validatedMailsAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description:
    'Your ValidatedMails API key. You can find it in your ValidatedMails dashboard.',
  required: true,
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: 'https://api.validatedmails.com/api-keys/me',
        headers: {
          Authorization: `Bearer ${auth}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });

      return {
        valid: true,
      };
    } catch {
      return {
        valid: false,
        error: 'Unauthorized: Invalid API key',
      };
    }
  },
});
