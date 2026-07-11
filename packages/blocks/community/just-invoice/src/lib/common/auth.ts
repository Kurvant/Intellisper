import { BlockAuth } from '@intelblocks/blocks-framework';

export const justInvoiceAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Enter your JustInvoice API key. You can find this in your JustInvoice account settings.',
  required: true,
});
