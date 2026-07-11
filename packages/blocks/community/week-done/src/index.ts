import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock, OAuth2PropertyValue, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createItemAction } from './lib/actions/items/create-item';
import { deleteItemAction } from './lib/actions/items/delete-item';
import { searchItemsAction } from './lib/actions/items/search-items';
import { updateItemAction } from './lib/actions/items/update-item';
import { assignItemAction } from './lib/actions/items/assign-item';
import { addItemCommentAction } from './lib/actions/items/add-item-comment';
import { deleteItemCommentAction } from './lib/actions/items/delete-item-comment';
import { getItemCommentsAction } from './lib/actions/items/get-item-comments';
import { addItemLikeAction } from './lib/actions/items/add-item-like';
import { deleteItemLikeAction } from './lib/actions/items/delete-item-like';
import { getItemLikesAction } from './lib/actions/items/get-item-likes';
import { sortItemsAction } from './lib/actions/items/sort-items';
import { getCompanyInfoAction } from './lib/actions/company';
import { weekdoneAuth } from './lib/auth';

export const weekdone = createBlock({
  displayName: 'Weekdone',
  description:
    'Goal-setting and progress tracking software that helps teams align their objectives and key results (OKRs).',
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/week-done.png',
  categories: [BlockCategory.PRODUCTIVITY],
  authors: ['onyedikachi-david'],
  auth: weekdoneAuth,
  actions: [
    searchItemsAction,
    createItemAction,
    updateItemAction,
    assignItemAction,
    deleteItemAction,
    getItemLikesAction,
    addItemLikeAction,
    deleteItemLikeAction,
    getItemCommentsAction,
    addItemCommentAction,
    deleteItemCommentAction,
    sortItemsAction,
    getCompanyInfoAction,
    createCustomApiCallAction({
      auth: weekdoneAuth,
      baseUrl: () => 'https://api.weekdone.com/1',
      authLocation: 'queryParams',
      authMapping: async (auth) => ({
        token: (auth as OAuth2PropertyValue).access_token,
      }),
    }),
  ],
  triggers: [],
});