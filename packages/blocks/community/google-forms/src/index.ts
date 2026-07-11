import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  createBlock,
} from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { newResponse } from './lib/triggers/new-form-response';
import { googleFormsAuth, getAccessToken } from './lib/common/common';

export { googleFormsAuth, getAccessToken, GoogleFormsAuthValue } from './lib/common/common';

export const googleForms = createBlock({
  displayName: 'Google Forms',
  description: 'Receive form responses from Google Forms',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/google-forms.png',
  categories: [BlockCategory.FORMS_AND_SURVEYS],
  authors: ["kishanprmr","MoShizzle","khaledmashaly","abuaboud","Startouf"],
  auth: googleFormsAuth,
  actions: [
    createCustomApiCallAction({
      baseUrl: () => 'https://forms.googleapis.com/v1',
      auth: googleFormsAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${await getAccessToken(auth as any)}`,
      }),
    }),
  ],
  triggers: [newResponse],
});
