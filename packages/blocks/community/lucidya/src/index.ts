import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { HttpMethod } from '@intelblocks/blocks-common';
import { makeRequest } from './lib/common';
import { newAlertTrigger } from './lib/triggers';
import { BlockCategory } from '@intelblocks/shared';
import { lucidyaAuth } from './lib/auth';

export const lucidya = createBlock({
  displayName: 'Lucidya',
  description: 'AI-powered social media analytics and customer experience management',
  auth: lucidyaAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/lucidya.png',
  categories: [BlockCategory.MARKETING],
  authors: ["onyedikachi-david"],
  actions: [],
  triggers: [newAlertTrigger],
});
