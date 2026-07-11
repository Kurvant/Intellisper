import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  createBlock,
  OAuth2PropertyValue,
  BlockAuth,
  Property,
} from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { common } from './lib/common';
import { newInvoice } from './lib/triggers/new-invoice';

export const zohoAuth = BlockAuth.OAuth2({
  required: true,
  authUrl: 'https://accounts.zoho.{region}/oauth/v2/auth',
  tokenUrl: 'https://accounts.zoho.{region}/oauth/v2/token',
  scope: ['ZohoInvoice.invoices.READ'],
  props: {
    region: Property.StaticDropdown({
      displayName: 'Region',
      description: 'Select your account region',
      required: true,
      options: {
        options: [
          {
            label: 'US (.com)',
            value: 'com',
          },
          {
            label: 'Europe (.eu)',
            value: 'eu',
          },
          {
            label: 'India (.in)',
            value: 'in',
          },
          {
            label: 'Australia (.com.au)',
            value: 'com.au',
          },
          {
            label: 'Japan (.jp)',
            value: 'jp',
          },
        ],
      },
    }),
  },
});

export const zohoInvoice = createBlock({
  displayName: 'Zoho Invoice',
  description: 'Online invoicing software for businesses',

  auth: zohoAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/zoho-invoice.png',
  categories: [BlockCategory.ACCOUNTING],
  authors: ["kishanprmr","MoShizzle","abuaboud"],
  actions: [
    createCustomApiCallAction({
      baseUrl: (auth) =>
        common.baseUrl((auth as OAuth2PropertyValue).props!['region']),
      auth: zohoAuth,
      authMapping: async (auth) =>
        common.authHeaders((auth as OAuth2PropertyValue).access_token),
    }),
  ],
  triggers: [newInvoice],
});
