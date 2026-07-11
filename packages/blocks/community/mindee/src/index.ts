import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { mindeePredictDocumentAction } from './lib/actions/predict-document';

export const mindeeAuth = BlockAuth.SecretText({
  displayName: 'Api Key',
  description: `
  #### To obtain access your Api Key
  1. Sign up and log in to Mindee
  2. Go to [API Key page](https://platform.mindee.com/api-keys)
  3. Copy the Key and paste below.
  `,
  required: true,
});

export const mindee = createBlock({
  displayName: 'Mindee',
  description: 'Document automation API',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/mindee.png',
  categories: [BlockCategory.COMMUNICATION],
  authors: ["kanarelo","kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  auth: mindeeAuth,
  actions: [
    mindeePredictDocumentAction,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.mindee.net/v1',
      auth: mindeeAuth,
      authMapping: async (auth) => ({
        Authorization: `Token ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [],
});
