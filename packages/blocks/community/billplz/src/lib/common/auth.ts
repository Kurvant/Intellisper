import { BlockAuth } from '@intelblocks/blocks-framework';

export const billplzAuth = BlockAuth.SecretText({
  displayName: 'API Secret Key',
  description: 'Enter your Billplz API Secret Key. You can find this in your Billplz account settings.',
  required: true,
});
