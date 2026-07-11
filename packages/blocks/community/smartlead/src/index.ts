import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

import { smartleadAuth } from './lib/auth';
import { BASE_URL } from './lib/common/client';
import { createCampaignAction } from './lib/actions/create-campaign';
import { addLeadsToCampaignAction } from './lib/actions/add-leads-to-campaign';
import { getCampaignStatisticsAction } from './lib/actions/get-campaign-statistics';
import { updateCampaignSettingsAction } from './lib/actions/update-campaign-settings';

export const smartlead = createBlock({
  displayName: 'SmartLead',
  description:
    'Powerful cold email outreach platform with multi-account rotation, email warmup, unified inbox, and advanced analytics.',
  auth: smartleadAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/smartlead.png',
  categories: [BlockCategory.MARKETING, BlockCategory.SALES_AND_CRM],
  authors: ['Harmatta'],
  actions: [
    createCampaignAction,
    addLeadsToCampaignAction,
    getCampaignStatisticsAction,
    updateCampaignSettingsAction,
    createCustomApiCallAction({
      auth: smartleadAuth,
      baseUrl: () => BASE_URL,
      authLocation: 'queryParams',
      authMapping: async (auth) => ({
        api_key: auth.secret_text,
      }),
    }),
  ],
  triggers: [],
});
