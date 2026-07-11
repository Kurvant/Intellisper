import { BlockAuth } from '@intelblocks/blocks-framework';

export const gptzeroDetectAiAuth = BlockAuth.SecretText({
  displayName: 'GPTZero API Key',
  description: 'https://app.gptzero.me/app/api to get your API key',
  required: true,
});
