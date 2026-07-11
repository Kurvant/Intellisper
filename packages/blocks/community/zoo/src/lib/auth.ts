import { BlockAuth } from '@intelblocks/blocks-framework';

export const zooAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Your Zoo API Key (Bearer Token).',
});
