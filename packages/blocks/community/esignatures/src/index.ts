import { createBlock } from '@intelblocks/blocks-framework';
import { esignaturesAuth } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';
import { createContract } from './lib/actions/create-contract';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

export const esignatures = createBlock({
  displayName: 'eSignatures',
  auth: esignaturesAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/esignatures.png',
  authors: ['sanket-a11y'],
  categories: [BlockCategory.SALES_AND_CRM],
  actions: [
    createContract,
    createCustomApiCallAction({
      baseUrl: () => `https://esignatures.com/api`,
      authLocation: 'queryParams',
      auth: esignaturesAuth,
      authMapping: async (auth) => {
        return {
          token: `${auth.secret_text}`,
        };
      },
    }),
  ],
  triggers: [],
});
