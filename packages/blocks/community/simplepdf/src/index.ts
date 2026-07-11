import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { simplePDFNewSubmission } from './lib/triggers/new-submission';

export const simplepdf = createBlock({
  displayName: 'SimplePDF',
  description: 'PDF editing and generation tool',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/simplepdf.png',
  authors: ["bendersej","kishanprmr","khaledmashaly","abuaboud"],
  categories: [BlockCategory.CONTENT_AND_FILES],
  actions: [],
  triggers: [simplePDFNewSubmission],
});
