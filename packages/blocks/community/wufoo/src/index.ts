import {
  createCustomApiCallAction,
  HttpMethod,
} from '@intelblocks/blocks-common';
import { AppConnectionValueForAuthProperty, createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { wufooApiCall } from './lib/common/client';
import { createFormEntryAction } from './lib/actions/create-form-entry';
import { findFormAction } from './lib/actions/find-form';
import { findSubmissionByFieldAction } from './lib/actions/find-submission-by-field';
import { getEntryDetailsAction } from './lib/actions/get-entry-details';
import { newFormEntryTrigger } from './lib/triggers/new-form-entry';
import { newFormTrigger } from './lib/triggers/new-form';
import { AppConnectionType } from '@intelblocks/shared';
import { wufooAuth } from './lib/auth';

export const wufoo = createBlock({
  displayName: 'Wufoo',
  auth: wufooAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/wufoo.png',
  authors: ['krushnarout','onyedikachi-david'],
  actions: [
    createFormEntryAction,
    findFormAction,
    findSubmissionByFieldAction,
    getEntryDetailsAction,
    createCustomApiCallAction({
      auth: wufooAuth,
      baseUrl: (auth: any) => `https://${auth.subdomain}.wufoo.com/api/v3`,
      authMapping: async (auth) => {
        const { apiKey } = auth.props;
        const encoded = Buffer.from(`${apiKey}:footastic`).toString('base64');
        return {
          Authorization: `Basic ${encoded}`,
        };
      },
    }),
  ],
  triggers: [newFormEntryTrigger, newFormTrigger],
});
