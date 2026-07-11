import { BlockAuth } from '@intelblocks/blocks-framework';

export const flipandoAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Flipando API Key',
  required: true,
});
