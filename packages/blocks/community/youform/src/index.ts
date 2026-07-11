import { createBlock } from '@intelblocks/blocks-framework';
import { youformAuth } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';
import { newSubmissionTrigger } from './lib/triggers/new-form-submission';

export const youform = createBlock({
  displayName: 'Youform',
  auth: youformAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/youform.png',
  authors: ['kishanprmr'],
  categories: [BlockCategory.FORMS_AND_SURVEYS],
  actions: [],
  triggers: [newSubmissionTrigger],
});
