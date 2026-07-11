import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { removeBackground } from './lib/actions/remove-background';

export const photoroomAuth = BlockAuth.CustomAuth({
  required: true,
  props: {
    apiKey: BlockAuth.SecretText({
      displayName: 'API key',
      required: true,
    }),
  },
});

export const photoroom = createBlock({
  displayName: 'Photoroom',
  auth: photoroomAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/photoroom.png',
  authors: ['AdamSelene', 'Charles-Go'],
  actions: [removeBackground],
  triggers: [],
});
