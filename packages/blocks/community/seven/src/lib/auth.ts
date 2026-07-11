import { BlockAuth } from '@intelblocks/blocks-framework';

export const sevenAuth = BlockAuth.SecretText({
  description:
    'You can find your API key in [Developer Menu](https://app.seven.io/developer).',
  displayName: 'API key',
  required: true,
});
