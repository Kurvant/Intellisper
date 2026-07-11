import { BlockAuth, Property } from '@intelblocks/blocks-framework';
import { wayfrontApiClient } from './common';

export const wayfrontAuth = BlockAuth.CustomAuth({
  description: 'Provide your Wayfront workspace URL and bearer token.',
  props: {
    workspaceUrl: Property.ShortText({
      displayName: 'Workspace URL',
      description: 'Your Wayfront workspace URL (e.g. example.wayfront.com)',
      required: true,
    }),
    apiToken: BlockAuth.SecretText({
      displayName: 'API Token',
      description: 'Your Wayfront bearer token',
      required: true,
    }),
  },
  validate: async ({ auth }) => {
    const { success, error } = await wayfrontApiClient(auth.workspaceUrl, auth.apiToken).validateAuth();
    return success ? { valid: true } : { valid: false, error: error ?? 'Authentication failed.' };
  },
  required: true,
});

