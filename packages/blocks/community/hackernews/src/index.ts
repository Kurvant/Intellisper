import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { fetchTopStories } from './lib/actions/top-stories-in-hacker-news';

export const hackernews = createBlock({
  displayName: 'Hacker News',
  description: 'A social news website',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/hackernews.png',
  auth: BlockAuth.None(),
  categories: [],
  authors: ["kishanprmr","AbdulTheActivePiecer","khaledmashaly","abuaboud"],
  actions: [fetchTopStories],
  triggers: [],
});
