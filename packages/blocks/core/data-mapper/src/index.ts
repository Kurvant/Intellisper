import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { advancedMapping } from './lib/actions/advanced-mapping';

export const dataMapper = createBlock({
  displayName: 'Data Mapper',
  description: 'tools to manipulate data structure',

  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/data-mapper.svg',
  auth: BlockAuth.None(),
  categories: [BlockCategory.CORE],
  authors: ["kishanprmr","MoShizzle","AbdulTheActivePiecer","khaledmashaly","abuaboud"],
  actions: [advancedMapping],
  triggers: [],
});
