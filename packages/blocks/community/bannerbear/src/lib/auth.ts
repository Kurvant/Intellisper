import { BlockAuth } from '@intelblocks/blocks-framework';

export const bannerbearAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Bannerbear API Key',
  required: true,
});
