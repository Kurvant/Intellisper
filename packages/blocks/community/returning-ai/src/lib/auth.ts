import { BlockAuth } from '@intelblocks/blocks-framework';

export const returningAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Add api key from returning.ai',
});
