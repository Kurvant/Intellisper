import { BlockAuth } from '@intelblocks/blocks-framework';

export const lokaliseAuth = BlockAuth.SecretText({
  displayName: 'API Token',
  description:
    'Lokalise API Token. You can generate one from your Lokalise account.',
  required: true,
});
