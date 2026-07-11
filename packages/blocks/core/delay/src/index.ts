import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { delayForAction } from './lib/actions/delay-for-action';
import { delayUntilAction } from './lib/actions/delay-until-action';

export const delay = createBlock({
  displayName: 'Delay',
  description: 'Use it to delay the execution of the next action',
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/delay.svg',
  authors: ["Nilesh","kishanprmr","MoShizzle","AbdulTheActivePiecer","khaledmashaly","abuaboud"],
  categories: [BlockCategory.CORE, BlockCategory.FLOW_CONTROL],
  auth: BlockAuth.None(),
  actions: [
    delayForAction, // Delay for a fixed duration
    delayUntilAction, // Takes a timestamp parameter instead of duration
  ],
  triggers: [],
});
