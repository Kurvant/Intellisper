import { createBlock } from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockCategory } from '@intelblocks/shared';
import { rendexAuth } from './lib/common/auth';
import { RENDEX_BASE_URL } from './lib/common/common';
import { renderToImage } from './lib/actions/render-to-image';

export const rendex = createBlock({
  displayName: 'Rendex',
  description:
    'Render raw HTML, a URL, or Markdown to a PNG, JPEG, or WebP image or a PDF via the Rendex API.',
  auth: rendexAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/rendex.png',
  categories: [BlockCategory.CONTENT_AND_FILES, BlockCategory.DEVELOPER_TOOLS],
  authors: ['Dan425953'],
  actions: [
    renderToImage,
    createCustomApiCallAction({
      baseUrl: () => RENDEX_BASE_URL,
      auth: rendexAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [],
});

export { rendexAuth };
