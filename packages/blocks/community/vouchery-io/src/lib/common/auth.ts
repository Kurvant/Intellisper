import { BlockAuth } from '@intelblocks/blocks-framework';

export const voucheryIoAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Vouchery-io API Key',
  required: true,
});
