import {
  createBlock,
  OAuth2PropertyValue,
  BlockAuth,
} from '@intelblocks/blocks-framework';

import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockCategory } from '@intelblocks/shared';
import { newResponse } from './lib/triggers/new-response';

export const smAuth = BlockAuth.OAuth2({
  authUrl: 'https://api.surveymonkey.com/oauth/authorize',
  tokenUrl: 'https://api.surveymonkey.com/oauth/token',
  required: true,
  scope: [
    'responses_read',
    'responses_read_detail',
    'webhooks_read',
    'webhooks_write',
    'surveys_read',
  ],
});

export const surveymonkey = createBlock({
  displayName: 'SurveyMonkey',
  description: 'Receive survey responses from SurveyMonkey',
  auth: smAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/surveymonkey.png',
  categories: [BlockCategory.FORMS_AND_SURVEYS],
  authors: ["kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  actions: [
    createCustomApiCallAction({
      baseUrl: () => 'https://api.surveymonkey.com/v3',
      auth: smAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${(auth as OAuth2PropertyValue).access_token}`,
      }),
    }),
  ],
  triggers: [newResponse],
});
