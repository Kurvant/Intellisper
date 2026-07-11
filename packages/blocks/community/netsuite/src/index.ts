import {
  BlockAuth,
  createBlock,
  Property,
  BlockPropValueSchema,
} from '@intelblocks/blocks-framework';
import { getVendor } from './lib/actions/get-vendor';
import { getCustomer } from './lib/actions/get-customer';
import { runSuiteQL } from './lib/actions/run-suiteql';
import { executeDataset } from './lib/actions/execute-dataset';
import { BlockCategory } from '@intelblocks/shared';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createOAuthHeader } from './lib/common/oauth';

export const netsuiteAuth = BlockAuth.CustomAuth({
  required: true,
  props: {
    accountId: Property.ShortText({
      displayName: 'Account ID',
      required: true,
      description: 'Your NetSuite account ID',
    }),
    consumerKey: Property.ShortText({
      displayName: 'Consumer Key',
      required: true,
      description: 'Your NetSuite consumer key',
    }),
    consumerSecret: BlockAuth.SecretText({
      displayName: 'Consumer Secret',
      required: true,
      description: 'Your NetSuite consumer secret',
    }),
    tokenId: Property.ShortText({
      displayName: 'Token ID',
      required: true,
      description: 'Your NetSuite token ID',
    }),
    tokenSecret: BlockAuth.SecretText({
      displayName: 'Token Secret',
      required: true,
      description: 'Your NetSuite token secret',
    }),
  },
});

export const netsuite = createBlock({
  displayName: 'NetSuite',
  logoUrl: 'https://cdn.activepieces.com/pieces/netsuite.png',
  categories: [BlockCategory.ACCOUNTING],
  auth: netsuiteAuth,
  authors: ['geekyme', 'danielpoonwj'],
  actions: [
    getVendor,
    getCustomer,
    runSuiteQL,
    executeDataset,
    createCustomApiCallAction({
      baseUrl: (auth) => {
        if (!auth) {
          return '';
        }
        const authValue = auth.props;
        return `https://${authValue.accountId}.suitetalk.api.netsuite.com`;
      },
      auth: netsuiteAuth,
      authMapping: async (auth, propsValue) => {
        const authValue = auth.props;

        const authHeader = createOAuthHeader(
          authValue.accountId,
          authValue.consumerKey,
          authValue.consumerSecret,
          authValue.tokenId,
          authValue.tokenSecret,
          propsValue['url']['url'],
          propsValue['method'],
          propsValue['queryParams']
        );

        return {
          Authorization: authHeader,
          prefer: 'transient',
          Cookie: 'NS_ROUTING_VERSION=LAGGING',
        };
      },
    }),
  ],
  triggers: [],
});
