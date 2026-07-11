import { BlockAuth } from '@intelblocks/blocks-framework';

export const modelsLabAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Get your API key at https://modelslab.com/account/api-key',
  required: true,
});
