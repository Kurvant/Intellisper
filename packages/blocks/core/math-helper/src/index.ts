import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { addition } from './lib/actions/addition';
import { division } from './lib/actions/division';
import { generateRandom } from './lib/actions/generateRandom';
import { modulo } from './lib/actions/modulo';
import { multiplication } from './lib/actions/multiplication';
import { subtraction } from './lib/actions/subtraction';

const markdownDescription = `
Perform mathematical operations.
`;

export const math = createBlock({
  displayName: 'Math Helper',
  description: markdownDescription,
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/math-helper.svg',
  categories: [BlockCategory.CORE],
  authors: ["kishanprmr","MoShizzle","abuaboud"],
  actions: [
    addition,
    subtraction,
    multiplication,
    division,
    modulo,
    generateRandom,
  ],
  triggers: [],
});
