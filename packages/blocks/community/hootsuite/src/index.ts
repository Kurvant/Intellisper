import { createBlock } from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { OAuth2PropertyValue } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createMessageAction } from './lib/actions/create-message';
import { getMessageAction } from './lib/actions/get-message';
import { deleteMessageAction } from './lib/actions/delete-message';
import { newScheduledPostTrigger } from './lib/triggers/new-scheduled-post';
import { newPublishedPostTrigger } from './lib/triggers/new-published-post';
import { hootsuiteAuth } from './lib/auth';

export const hootsuite = createBlock({
  displayName: 'Hootsuite',
  description: 'Social media management — schedule posts and manage multiple networks from one dashboard.',
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/hootsuite.png',
  categories: [BlockCategory.MARKETING],
  auth: hootsuiteAuth,
  authors: ['onyedikachi-david'],
  actions: [
    createMessageAction,
    getMessageAction,
    deleteMessageAction,
    createCustomApiCallAction({
      baseUrl: () => 'https://platform.hootsuite.com/v1',
      auth: hootsuiteAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${(auth as OAuth2PropertyValue).access_token}`,
      }),
    }),
  ],
  triggers: [newScheduledPostTrigger, newPublishedPostTrigger],
});

export { hootsuiteAuth };
