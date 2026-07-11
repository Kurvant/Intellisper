import { BlockAuth } from '@intelblocks/blocks-framework';

export const greenptAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'API Key for Greenpt',
  required: true,
});
