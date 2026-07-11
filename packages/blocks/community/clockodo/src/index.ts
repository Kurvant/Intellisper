import {
  BlockAuth,
  Property,
  createBlock,
} from '@intelblocks/blocks-framework';

import { BlockCategory } from '@intelblocks/shared';
import actions from './lib/actions';
import triggers from './lib/triggers';
import { clockodoAuth } from './lib/auth';

export const clockodo = createBlock({
  displayName: 'Clockodo',
  description: 'Time tracking made easy',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/clockodo.png',
  categories: [BlockCategory.PRODUCTIVITY],
  authors: ["JanHolger","kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  auth: clockodoAuth,
  actions,
  triggers,
});
