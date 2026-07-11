import {
  createBlock,
  OAuth2PropertyValue,
} from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { youtubeNewVideoTrigger } from './lib/triggers/new-video.trigger';
import { youtubeAuth } from './lib/common/auth';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

export const youtube = createBlock({
  displayName: 'YouTube',
  description:
    'Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube',

  minimumSupportedRelease: '0.33.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/youtube.png',
  categories: [BlockCategory.CONTENT_AND_FILES],
  auth: youtubeAuth,
  authors: ['abaza738', 'kishanprmr', 'khaledmashaly', 'abuaboud', 'hugh-codes'],
  actions: [
    createCustomApiCallAction({
      baseUrl: () => 'https://www.googleapis.com/youtube/v3',
      auth: youtubeAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${(auth as OAuth2PropertyValue).access_token}`,
      }),
    }),
  ],
  triggers: [youtubeNewVideoTrigger],
});
