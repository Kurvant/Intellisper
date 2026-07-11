import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { AppConnectionType, BlockCategory } from '@intelblocks/shared';
import { createEntryAction } from './lib/actions/create-entry';
import { updateEntryAction } from './lib/actions/update-entry';
import { deleteEntryAction } from './lib/actions/delete-entry';
import { getEntryAction } from './lib/actions/get-entry';
import { newEntryTrigger } from './lib/triggers/new-entry-submitted';
import { entryUpdatedTrigger } from './lib/triggers/entry-updated';
import {
  createCustomApiCallAction,
  HttpMethod,
} from '@intelblocks/blocks-common';
import { makeRequest } from './lib/common';
import { cognitoFormsAuth } from './lib/auth';

export const cognitoForms = createBlock({
  displayName: 'Cognito Forms',
  auth: cognitoFormsAuth,
  logoUrl: 'https://cdn.activepieces.com/pieces/cognito-forms.png',
  authors: ['krushnarout'],
  categories: [BlockCategory.PRODUCTIVITY, BlockCategory.FORMS_AND_SURVEYS],
  actions: [
    createEntryAction,
    updateEntryAction,
    deleteEntryAction,
    getEntryAction,
    createCustomApiCallAction({
      auth: cognitoFormsAuth,
      baseUrl: () => 'https://www.cognitoforms.com/api',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth}`,
        };
      },
    }),
  ],
  triggers: [newEntryTrigger, entryUpdatedTrigger],
});
