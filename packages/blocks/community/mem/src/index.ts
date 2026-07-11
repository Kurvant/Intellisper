import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createMemAction } from './lib/actions/create-mem';
import { createNoteAction } from './lib/actions/create-note';
import { deleteNoteAction } from './lib/actions/delete-note';
import { memAuth } from './lib/auth';

export const mem = createBlock({
  displayName: 'Mem',
  description: 'Capture and organize your thoughts using Mem.ai',
  auth: memAuth,
  logoUrl: 'https://cdn.activepieces.com/pieces/mem.png',
  authors: ['krushnarout', 'kishanprmr'],
  categories: [BlockCategory.PRODUCTIVITY],
  actions: [
    createMemAction,
    createNoteAction,
    deleteNoteAction,
    createCustomApiCallAction({
      auth: memAuth,
      baseUrl: () => 'https://api.mem.ai/v2',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth}`,
        };
      },
    }),
  ],
  triggers: [],
});
