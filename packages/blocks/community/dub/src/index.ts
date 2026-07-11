import { createBlock } from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { dubAuth, DUB_API_BASE } from './lib/auth';
import { createLink } from './lib/actions/create-link';
import { getLink } from './lib/actions/get-link';
import { listLinks } from './lib/actions/list-links';
import { updateLink } from './lib/actions/update-link';
import { deleteLink } from './lib/actions/delete-link';
import { linkClicked } from './lib/triggers/link-clicked';
import { linkCreated } from './lib/triggers/link-created';
import { BlockCategory } from '@intelblocks/shared';

export const dub = createBlock({
  displayName: 'Dub',
  description:
    'Dub is the modern link attribution platform for creating, managing, and analysing short links, tracking conversions, and running affiliate programmes.',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/dub.png',
  categories: [BlockCategory.MARKETING, BlockCategory.DEVELOPER_TOOLS],
  auth: dubAuth,
  actions: [
    createLink,
    getLink,
    listLinks,
    updateLink,
    deleteLink,
    createCustomApiCallAction({
      auth: dubAuth,
      baseUrl: () => DUB_API_BASE,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text}`,
      }),
    }),
  ],
  authors: ['Harmatta'],
  triggers: [linkClicked, linkCreated],
});
