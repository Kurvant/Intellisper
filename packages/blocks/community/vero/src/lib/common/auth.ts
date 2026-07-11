import { BlockAuth } from '@intelblocks/blocks-framework';

export const veroAuth = BlockAuth.SecretText({
  displayName: 'Auth Token',
  description: 'Vero auth token',
  required: true,
});
