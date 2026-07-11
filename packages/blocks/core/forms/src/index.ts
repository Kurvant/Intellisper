import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { onChatSubmission } from './lib/triggers/chat-trigger';
import { onFormSubmission } from './lib/triggers/form-trigger';
import { returnResponse } from './lib/actions/return-response';

export const forms = createBlock({
  displayName: 'Human Input',
  description: 'Trigger a flow through human input.',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.65.0',
  categories: [BlockCategory.CORE],
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/human-input.svg',
  authors: ['anasbarg', 'MoShizzle', 'abuaboud'],
  actions: [returnResponse],
  triggers: [onFormSubmission, onChatSubmission],
});
