import { BlockAuth } from '@intelblocks/blocks-framework';
import { HttpMethod } from '@intelblocks/blocks-common';
import { AppConnectionType } from '@intelblocks/shared';
import { wufooApiCall } from './common/client';

export const wufooAuth = BlockAuth.CustomAuth({
  description: 'Enter your Wufoo API Key and Subdomain.',
  props: {
    apiKey: BlockAuth.SecretText({
      displayName: 'API Key',
      required: true,
    }),
    subdomain: BlockAuth.SecretText({
      displayName: 'Subdomain',
      description:
        'Your Wufoo account subdomain (e.g., for fishbowl.wufoo.com, use "fishbowl")',
      required: true,
    }),
  },
  validate: async ({ auth }) => {
    try {
      await wufooApiCall({
        method: HttpMethod.GET,
        auth: {
          props: auth,
          type: AppConnectionType.CUSTOM_AUTH,
        },
        resourceUri: '/forms.json',
      });
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        error: 'Invalid API Key or Subdomain',
      };
    }
  },
  required: true,
});
