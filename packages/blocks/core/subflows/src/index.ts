import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { callFlow } from './lib/actions/call-flow';
import { callableFlow } from './lib/triggers/callable-flow';
import { response } from './lib/actions/respond';
import { BlockCategory } from '@intelblocks/shared';

export const flows = createBlock({
  displayName: 'Sub Flows',
  description: 'Trigger and call another sub flow.',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.82.0',
  categories: [BlockCategory.CORE, BlockCategory.FLOW_CONTROL],
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/subflows.svg',
  authors: ['hazemadelkhalel'],
  actions: [callFlow, response],
  triggers: [callableFlow],
});
