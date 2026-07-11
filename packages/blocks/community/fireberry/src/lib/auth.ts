import { BlockAuth } from '@intelblocks/blocks-framework';

export const fireberryAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Enter your Fireberry API Key. You can generate it from your Fireberry account settings.',
  required: true,
});
