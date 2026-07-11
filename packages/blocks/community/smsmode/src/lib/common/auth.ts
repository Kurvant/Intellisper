import { BlockAuth } from '@intelblocks/blocks-framework';

export const smsmodeAuth = BlockAuth.SecretText({
  displayName: 'Smsmode API Key',
  description: 'Smsmode API Key is required to authenticate requests',
  required: true,
});
