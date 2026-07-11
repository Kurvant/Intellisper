import { createBlock } from '@intelblocks/blocks-framework';
import { signrequestAuth } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';
import { sendSignrequest } from './lib/actions/send-signrequest';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

export const signrequest = createBlock({
  displayName: 'Signrequest',
  auth: signrequestAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/signrequest.png',
  categories: [BlockCategory.SALES_AND_CRM],
  authors: ['sanket-a11y'],
  actions: [
    sendSignrequest,
    createCustomApiCallAction({
      auth: signrequestAuth,
      baseUrl: () => 'https://signrequest.com/api/v1',
      authMapping: async (auth) => {
        return {
          Authorization: auth.secret_text,
        };
      },
    }),
  ],
  triggers: [],
});
