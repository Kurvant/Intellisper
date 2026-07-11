import { createBlock, BlockAuth, Property } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";

import { identifyAction } from './lib/actions/identify';
import { trackAction } from './lib/actions/track';
import { screenAction } from './lib/actions/screen';

export const dittofeedAuth = BlockAuth.CustomAuth({
  props: {
    apiKey: BlockAuth.SecretText({
      displayName: 'API Key',
      required: true,
      description: 'Your API key of Dittofeed.',
    }),
    baseUrl: Property.ShortText({
      displayName: 'Base URL',
      required: true,
      description: 'The base URL of your Dittofeed instance.',
      defaultValue: 'http://localhost:3200',
    }),
  },
  required: true,
});

export const dittofeed = createBlock({
  displayName: "Dittofeed",
  auth: dittofeedAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/dittofeed.png",
  authors: [
    'SmarterService'
  ],
  categories: [
    BlockCategory.MARKETING,
    BlockCategory.BUSINESS_INTELLIGENCE
  ],
  description: 'Customer data platform for user analytics and tracking',
  actions: [identifyAction, trackAction, screenAction],
  triggers: [],
});
    