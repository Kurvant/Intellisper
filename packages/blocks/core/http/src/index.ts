import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { httpSendRequestAction } from './lib/actions/send-http-request-action';
import { parseUrl } from './lib/actions/parse-url';

export const http = createBlock({
  displayName: 'HTTP',
  description: 'Sends HTTP requests and return responses',
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/http.svg',
  categories: [BlockCategory.CORE],
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.20.3',
  actions: [httpSendRequestAction, parseUrl],
  authors: [
    'bibhuty-did-this',
    'landonmoir',
    'JanHolger',
    'Salem-Alaa',
    'kishanprmr',
    'AbdulTheActivePiecer',
    'khaledmashaly',
    'abuaboud',
    'pfernandez98',
  ],
  triggers: [],
});
