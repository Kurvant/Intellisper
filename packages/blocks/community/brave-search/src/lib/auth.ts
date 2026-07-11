import { BlockAuth } from '@intelblocks/blocks-framework';

export const braveSearchAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description:
    'Your Brave Search API Key (get it from https://brave.com/search/api/)',
});
