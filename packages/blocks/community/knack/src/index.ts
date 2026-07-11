import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { knackAuth } from './lib/common/auth';
import { createRecordAction } from './lib/actions/create-record';
import { deleteRecordAction } from './lib/actions/delete-record';
import { findRecordAction } from './lib/actions/find-record';
import { updateRecordAction } from './lib/actions/update-record';
import { BlockCategory } from '@intelblocks/shared';

export const knack = createBlock({
  displayName: 'Knack',
  auth: knackAuth,
  minimumSupportedRelease: '0.20.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/knack.png',
  categories:[BlockCategory.CONTENT_AND_FILES],
  authors: ['aryel780'],
  actions: [
    createRecordAction,
    deleteRecordAction,
    findRecordAction,
    updateRecordAction,
    createCustomApiCallAction({
      auth: knackAuth,
      baseUrl: () => 'https://api.knack.com/v1',
      authMapping: async (auth) => {
        const { apiKey, applicationId } = auth.props;
        return {
          'X-Knack-Application-ID': applicationId,
          'X-Knack-REST-API-Key': apiKey,
        };
      },
    }),
  ],
  triggers: [],
});
