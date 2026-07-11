import { BlockAuth } from '@intelblocks/blocks-framework';

export const heymarketSmsAuth = BlockAuth.SecretText({
  displayName: 'Heymarket API Key',
  description:
    'Enter your Heymarket API Key. You can find it in your Heymarket account settings.',
  required: true,
});
