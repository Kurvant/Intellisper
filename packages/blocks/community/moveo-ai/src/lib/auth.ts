import { BlockAuth } from '@intelblocks/blocks-framework';

export const moveoAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Generate an API key in Deploy → Developer Tools → API Keys.',
  required: true,
});
