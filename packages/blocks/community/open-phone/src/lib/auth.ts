import { BlockAuth } from '@intelblocks/blocks-framework';

export const openPhoneAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description:
    'Enter your OpenPhone API key. You can generate one from the API tab in your workspace settings.',
});
