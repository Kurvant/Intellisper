import { createBlock } from '@intelblocks/blocks-framework';
import { barcodeLookupAuth } from './lib/common/auth';
import { searchByBarcode } from './lib/actions/search-by-barcode';
import { BlockCategory } from '@intelblocks/shared';

export const barcodeLookup = createBlock({
  displayName: 'Barcode Lookup',
  auth: barcodeLookupAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/barcode-lookup.png',
  authors: ['sanket-a11y'],
  categories: [BlockCategory.COMMERCE],
  description: 'Lookup product information by barcode number',
  actions: [searchByBarcode],
  triggers: [],
});
