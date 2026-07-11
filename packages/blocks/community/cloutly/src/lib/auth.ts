import { BlockAuth } from '@intelblocks/blocks-framework';

export const cloutlyAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Please enter the API Key obtained from Cloutly.',
});
