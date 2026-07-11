import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { getTrends } from './lib/actions/get-trends';
import { getTweet } from './lib/actions/get-tweet';
import { getUserTweets } from './lib/actions/get-user-tweets';
import { getUser } from './lib/actions/get-user';
import { searchTweets } from './lib/actions/search-tweets';
import { searchUsers } from './lib/actions/search-users';
import { xquikAuth } from './lib/auth';
import { xquikCommon } from './lib/common';

export const xquik = createBlock({
  displayName: 'Xquik',
  description:
    'Search public X/Twitter posts, users, timelines, and trends for automation workflows.',
  auth: xquikAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/xquik.png',
  authors: ['kriptoburak'],
  categories: [BlockCategory.BUSINESS_INTELLIGENCE, BlockCategory.MARKETING],
  actions: [
    searchTweets,
    getTweet,
    searchUsers,
    getUser,
    getUserTweets,
    getTrends,
    createCustomApiCallAction({
      auth: xquikAuth,
      baseUrl: () => xquikCommon.config.baseUrl,
      authMapping: async (auth) => {
        return {
          Accept: 'application/json',
          'User-Agent': xquikCommon.config.userAgent,
          'x-api-key': auth.secret_text,
          'xquik-api-contract': xquikCommon.config.apiContract,
        };
      },
    }),
  ],
  triggers: [],
});
