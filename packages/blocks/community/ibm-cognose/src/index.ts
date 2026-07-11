import {
  createBlock,
  BlockAuth,
  Property
} from '@intelblocks/blocks-framework';
import {
  HttpMethod,
  httpClient,
  createCustomApiCallAction
} from '@intelblocks/blocks-common';
import { BlockCategory } from '@intelblocks/shared';
import { CognosClient } from './lib/common/cognos-client';
import { createDataSourceAction } from './lib/actions/create-data-source';
import { updateDataSourceAction } from './lib/actions/update-data-source';
import { deleteDataSourceAction } from './lib/actions/delete-data-source';
import { getDataSourceAction } from './lib/actions/get-data-source';
import { updateContentObjectAction } from './lib/actions/update-content-object';
import { getContentObjectAction } from './lib/actions/get-content-object';
import { moveContentObjectAction } from './lib/actions/move-content-object';
import { copyContentObjectAction } from './lib/actions/copy-content-object';
import { ibmCognoseAuth } from './lib/auth';

export const ibmCognose = createBlock({
  displayName: 'IBM Cognos Analytics',
  description:
    'Business intelligence and performance management suite for data analysis and reporting',
  auth: ibmCognoseAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/ibm-cognose.png',
  categories: [BlockCategory.BUSINESS_INTELLIGENCE],
  authors: ['fortunamide', 'onyedikachi-david'],
  actions: [
    createDataSourceAction,
    getDataSourceAction,
    updateDataSourceAction,
    deleteDataSourceAction,
    getContentObjectAction,
    updateContentObjectAction,
    moveContentObjectAction,
    copyContentObjectAction,
    createCustomApiCallAction({
      baseUrl: (auth) => `${(auth as any).baseurl}/api/v1`,
      auth: ibmCognoseAuth,
      authMapping: async (auth: any) => {
        try {
          const client = new CognosClient(auth.props);
          await client.createSession();
          
          if (client['sessionCookies']) {
            return {
              Cookie: client['sessionCookies']
            };
          }

          return {};
        } catch (error) {
          throw new Error(
            `Failed to authenticate: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    })
  ],
  triggers: []
});
