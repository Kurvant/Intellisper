import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { BlockAuth } from '@intelblocks/blocks-framework';

export const shippoAuth = BlockAuth.SecretText({
  displayName: 'API Token',
  description: 'Your Shippo API token',
  required: true,
  validate: async ({ auth }) => {
    if (auth) {
      try {
        await httpClient.sendRequest({
          method: HttpMethod.GET,
          url: 'https://api.goshippo.com/orders/',
          headers: {
            Authorization: `ShippoToken ${auth}`,
          },
        });
        return {
          valid: true,
        };
      } catch (error) {
        return {
          valid: false,
          error: 'Invalid Api Key',
        };
      }
    }
    return {
      valid: false,
      error: 'Invalid Api Key',
    };
  },
});
