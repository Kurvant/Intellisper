import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { rssNewItemTrigger } from './lib/triggers/new-item-trigger';
import { rssNewItemListTrigger } from './lib/triggers/new-item-list-triggers';

export const rssFeed = createBlock({
  displayName: 'RSS Feed',
  description: 'Stay updated with RSS feeds',
  authors: ["Abdallah-Alwarawreh","kishanprmr","khaledmashaly","abuaboud", "Kevinyu-alan"],
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/rss.png',
  categories: [],
  auth: BlockAuth.None(),
  actions: [],
  triggers: [
    rssNewItemTrigger,
    rssNewItemListTrigger
  ],
});
