import { BlockAuth } from '@intelblocks/blocks-framework';

export const oneclickimpactAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'API Key for authenticating with 1ClickImpact',
  required: true,
});
