import { BlockAuth } from '@intelblocks/blocks-framework';

export const mailercheckAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Mailercheck API Key',
  required: true,
});
