import {
  createBlock,
  OAuth2PropertyValue,
  BlockAuth,
} from '@intelblocks/blocks-framework';

import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockCategory } from '@intelblocks/shared';
import { common } from './lib/common';
import { newComment } from './lib/triggers/new-comment';
import { newFile } from './lib/triggers/new-file';
import { newFolder } from './lib/triggers/new-folder';

export const boxAuth = BlockAuth.OAuth2({
  required: true,
  authUrl: 'https://account.box.com/api/oauth2/authorize',
  tokenUrl: 'https://api.box.com/oauth2/token',
  scope: ['manage_webhook', 'root_readonly', 'root_readwrite'],
});

export const box = createBlock({
  displayName: 'Box',
  description: 'Secure content management and collaboration',

  auth: boxAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/box.png',
  categories: [BlockCategory.CONTENT_AND_FILES],
  authors: ["kishanprmr","MoShizzle","abuaboud"],
  actions: [
    createCustomApiCallAction({
      baseUrl: () => common.baseUrl,
      auth: boxAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.access_token}`,
      }),
    }),
  ],
  triggers: [newFile, newFolder, newComment],
});
