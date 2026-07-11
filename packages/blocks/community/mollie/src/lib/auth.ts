import { BlockAuth } from '@intelblocks/blocks-framework';

export const mollieAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Enter your Mollie API key (starts with live_ or test_)',
  required: true,
});
