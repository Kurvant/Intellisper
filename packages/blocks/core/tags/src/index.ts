import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { addTag } from './lib/add-tag';

export const tags = createBlock({
  displayName: 'Tags',
  description: 'Add custom tags to your run for filtration',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/tags.svg',
  categories: [BlockCategory.CORE],
  authors: ["kishanprmr","MoShizzle","abuaboud"],
  actions: [addTag],
  triggers: [],
});
