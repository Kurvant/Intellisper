import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';

import { addRowsAction } from './lib/actions/add-rows';
import { deleteRowAction } from './lib/actions/delete-row';
import { getRowsAction } from './lib/actions/get-rows';
import { listTablesAction } from './lib/actions/list-tables';
import { updateRowAction } from './lib/actions/update-row';
import { glideAuth } from './lib/auth';
import { BASE_URL } from './lib/common/client';

export const glide = createBlock({
  displayName: 'Glide',
  description: "Manage Glide Big Tables and rows with Glide’s API.",
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/glide.png',
  categories: [BlockCategory.PRODUCTIVITY],
  authors: ['veri5ied'],
  auth: glideAuth,
  actions: [
    addRowsAction,
    getRowsAction,
    updateRowAction,
    deleteRowAction,
    listTablesAction,
    createCustomApiCallAction({
      auth: glideAuth,
      baseUrl: () => BASE_URL,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [],
});