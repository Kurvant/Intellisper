import { BlockAuth } from '@intelblocks/blocks-framework';

export const skyprepAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Skyprep API Key',
  required: true,
});
