import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  OAuth2PropertyValue,
  BlockAuth,
  createBlock,
} from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createOrUpdateContact } from './lib/actions/create-or-update-contact';
import { constantContactAuth } from './lib/auth';

export const constantContact = createBlock({
  displayName: 'Constant Contact',
  description: 'Email marketing for small businesses',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/constant-contact.png',
  categories: [BlockCategory.MARKETING],
  authors: ["kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  auth: constantContactAuth,
  actions: [
    createOrUpdateContact,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.cc.email/v3', // Replace with the actual base URL
      auth: constantContactAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.access_token}`,
      }),
    }),
  ],
  triggers: [],
});
