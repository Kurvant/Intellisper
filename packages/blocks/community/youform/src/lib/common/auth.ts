import { BlockAuth } from '@intelblocks/blocks-framework';
import {
  AuthenticationType,
  httpClient,
  HttpMethod,
} from '@intelblocks/blocks-common';
import { BASE_URL } from './constants';

export const youformAuth = BlockAuth.SecretText({
  displayName: 'API Token',
  description: `You can obtain API token from [Account Settings](https://app.youform.com/account).`,
  required: true,
  validate: async ({ auth }) => {
    try {
      await httpClient.sendRequest({
        method: HttpMethod.GET,
        url: BASE_URL + '/me',
        authentication: {
          type: AuthenticationType.BEARER_TOKEN,
          token: auth,
        },
      });
      return {
        valid: true,
      };
    } catch {
      return {
        valid: false,
        error: 'Invalid API Token',
      };
    }
  },
});
