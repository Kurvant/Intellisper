import { createBlock } from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockCategory } from '@intelblocks/shared';
import { editionguardAuth } from './lib/common/auth';
import { sendEbookDownloadLinks } from './lib/actions/send-ebook-download-links';

export const editionguard = createBlock({
  displayName: 'EditionGuard',
  description:
    'Secure eBook DRM and fulfillment — protect and deliver EPUB, MOBI, and PDF files with Adobe DRM, Readium LCP, or Social DRM.',
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/editionguard.png',
  categories: [BlockCategory.CONTENT_AND_FILES],
  auth: editionguardAuth,
  authors: ['sanket-a11y'],
  actions: [
    sendEbookDownloadLinks,
    createCustomApiCallAction({
      baseUrl: () => 'https://app.editionguard.com/api/v2',
      auth: editionguardAuth,
      authMapping: async (auth) => ({
        Authorization: `token ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [],
});
