import { BlockAuth } from '@intelblocks/blocks-framework';
import { sendpulseApiCall } from './client';
import { HttpMethod } from '@intelblocks/blocks-common';

export const sendpulseAuth = BlockAuth.CustomAuth({
  description: 'Enter your SendPulse client credentials',
  props: {
    clientId: BlockAuth.SecretText({
      displayName: 'Client ID',
      required: true,
    }),
    clientSecret: BlockAuth.SecretText({
      displayName: 'Client Secret',
      required: true,
    }),
  },
  validate: async ({ auth }) => {
    try {
      await sendpulseApiCall({
        method: HttpMethod.GET,
        resourceUri: '/addressbooks',
        auth,
      });
      return { valid: true };
    } catch {
      return {
        valid: false,
        error: 'Invalid Client ID or Client Secret',
      };
    }
  },
  required: true,
});
