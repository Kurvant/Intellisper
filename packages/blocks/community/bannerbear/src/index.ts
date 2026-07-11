import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { bannerbearCreateImageAction } from './lib/actions/create-image';
import { bannerbearAuth } from './lib/auth';

export const bannerbear = createBlock({
  displayName: 'Bannerbear',
  description: 'Automate image generation',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/bannerbear.png',
  categories: [BlockCategory.MARKETING],
  authors: ["kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  auth: bannerbearAuth,
  actions: [
    bannerbearCreateImageAction,
    createCustomApiCallAction({
      baseUrl: () => 'https://sync.api.bannerbear.com/v2',
      auth: bannerbearAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [],
});
