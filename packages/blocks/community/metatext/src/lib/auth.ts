import { BlockAuth } from '@intelblocks/blocks-framework';

export const metatextAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Contact support@metatext.io to get your API key.',
  required: true,
});
