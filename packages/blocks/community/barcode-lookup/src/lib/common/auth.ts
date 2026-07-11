import { BlockAuth } from '@intelblocks/blocks-framework';

export const barcodeLookupAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'API Key for Barcode Lookup',
  required: true,
});
