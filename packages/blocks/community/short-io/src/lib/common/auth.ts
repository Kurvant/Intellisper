import { BlockAuth } from '@intelblocks/blocks-framework';
import { shortIoApiCall } from './client';
import { HttpMethod } from '@intelblocks/blocks-common';
import { AppConnectionType } from '@intelblocks/shared';

export const shortIoAuth = BlockAuth.CustomAuth({
  description: 'Enter your Short.io API Key',
  props: {
    apiKey: BlockAuth.SecretText({
      displayName: 'API Key',
      required: true,
    }),
  },
  validate: async ({ auth }) => {
    try {
      await shortIoApiCall({
        method: HttpMethod.GET,
        auth: {
          type: AppConnectionType.CUSTOM_AUTH,
          props: auth,
        },
        resourceUri: '/api/domains',
      });
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        error: 'Invalid API Key',
      };
    }
  },
  required: true,
});
