import { BlockAuth } from '@intelblocks/blocks-framework';

export const kudosityAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Kudosity API Key',
  required: true,
});
