import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { fetchCryptoPairPrice } from './lib/actions/fetch-pair-price';

export const binance = createBlock({
  displayName: 'Binance',
  description: 'Fetch the price of a crypto pair from Binance',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/binance.png',
  categories: [],
  auth: BlockAuth.None(),
  actions: [fetchCryptoPairPrice],
  authors: ["kishanprmr","khaledmashaly","abuaboud"],
  triggers: [],
});
