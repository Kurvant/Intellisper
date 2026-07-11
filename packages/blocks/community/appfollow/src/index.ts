import { createBlock } from '@intelblocks/blocks-framework';
import { appfollowAuth } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';

import { newReview } from './lib/triggers/new-review';
import { newTag } from './lib/triggers/new-tag';

import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BASE_URL } from './lib/common/client';
import { replyToReview } from './lib/actions/reply-to-review';
import { addUser } from './lib/actions/add-user';

export const appfollow = createBlock({
  displayName: 'AppFollow',
  auth: appfollowAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/appfollow.png',
  description: 'Appfollow helps to manage and improve app reviews and ratings.',
  categories: [BlockCategory.BUSINESS_INTELLIGENCE],
  authors: ['sanket-a11y'],
  actions: [
    addUser,
    replyToReview,
    createCustomApiCallAction({
      auth: appfollowAuth,
      baseUrl: () => BASE_URL,
      authMapping: async (auth) => ({
        'X-AppFollow-API-Token': auth.secret_text,
      }),
    }),
  ],
  triggers: [newReview, newTag],
});
