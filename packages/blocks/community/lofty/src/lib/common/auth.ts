import { BlockAuth } from '@intelblocks/blocks-framework';

export const loftyAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'API Key for Lofty',
  required: true,
});
