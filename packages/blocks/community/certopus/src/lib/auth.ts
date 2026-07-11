import { BlockAuth } from '@intelblocks/blocks-framework';

export const certopusAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'API key acquired from your Certopus profile',
});
