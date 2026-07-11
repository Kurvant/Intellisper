import { BlockAuth } from '@intelblocks/blocks-framework';

export const dripAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Get it from https://www.getdrip.com/user/edit',
});
