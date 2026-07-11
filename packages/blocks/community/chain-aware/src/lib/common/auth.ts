import { BlockAuth } from '@intelblocks/blocks-framework';

export const chainAwareAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Enter your ChainAware API key.',
});
