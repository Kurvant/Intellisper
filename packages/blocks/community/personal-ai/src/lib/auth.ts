import { BlockAuth } from '@intelblocks/blocks-framework';

export const personalAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'API Key for authentication',
  required: true,
})
