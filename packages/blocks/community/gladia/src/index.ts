import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createTranscription } from './lib/actions/create-transcription';
import { uploadAFile } from './lib/actions/upload-a-file';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { gladiaAuth } from './lib/common/auth';

export const gladia = createBlock({
  displayName: 'Gladia',
  auth: gladiaAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/gladia.png',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ['sanket-a11y'],
  actions: [
    createTranscription,
    uploadAFile,
    createCustomApiCallAction({
      baseUrl: () => `https://api.gladia.io/v2`,
      auth: gladiaAuth,
      authMapping: async (auth) => ({
        'x-gladia-key': auth.secret_text,
      }),
    }),
  ],
  triggers: [],
});
