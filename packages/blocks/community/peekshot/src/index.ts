import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { captureScreenshot } from './lib/actions/capture-screenshot';
import { BlockCategory } from '@intelblocks/shared';
import {
  createCustomApiCallAction,
  httpClient,
  HttpMethod,
} from '@intelblocks/blocks-common';
import { peekshotAuth } from './lib/auth';

export const peekshot = createBlock({
  displayName: 'PeekShot',
  auth: peekshotAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/peekshot.png',
  categories: [BlockCategory.PRODUCTIVITY],
  authors: ['balwant1707'],
  actions: [
    captureScreenshot,
    createCustomApiCallAction({
      auth: peekshotAuth,
      baseUrl: () => 'https://api.peekshot.com/api/v1',
      authMapping: async (auth) => {
        return {
          'x-api-key': auth.secret_text,
        };
      },
    }),
  ],
  triggers: [],
});
