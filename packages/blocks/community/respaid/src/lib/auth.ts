import { BlockAuth } from '@intelblocks/blocks-framework';

export const respaidAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'You can find API Key in your Respaid account',
});
