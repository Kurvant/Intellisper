import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { newSubmissionTrigger } from './lib/triggers/new-submission.trigger';

export const formspark = createBlock({
  displayName: 'Formspark',
  auth: BlockAuth.None(),
  categories: [BlockCategory.FORMS_AND_SURVEYS],
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/formspark.png',
  authors: ['kishanprmr'],
  actions: [],
  triggers: [newSubmissionTrigger],
});
