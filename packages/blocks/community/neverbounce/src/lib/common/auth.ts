import { BlockAuth } from '@intelblocks/blocks-framework';

export const neverbounceAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Your Neverbounce API Key. Get it from https://neverbounce.com/',
  required: true,
});
