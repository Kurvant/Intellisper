import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { instantVerifyAction } from './lib/actions/instant-verify';
import { clearoutAuth } from './lib/auth';

export const clearout = createBlock({
  displayName: 'Clearout',
  description: 'Bulk email validation and verification',
  auth: clearoutAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/clearout.png',
  categories: [BlockCategory.SALES_AND_CRM],
  authors: ["joeworkman","kishanprmr","MoShizzle","abuaboud"],
  actions: [
    instantVerifyAction,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.clearout.io/v2', // Replace with the actual base URL
      auth: clearoutAuth,
      authMapping: async (auth) => ({
        Authorization: `${auth.props.apiKey}`,
      }),
    }),
  ],
  triggers: [],
});

// Clearout API Docs https://docs.clearout.io/api.html
