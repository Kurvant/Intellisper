import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { gravityFormsNewSubmission } from './lib/triggers/new-submission';

export const gravityforms = createBlock({
  displayName: 'Gravity Forms',
  description: 'Build and publish your WordPress forms',

  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.27.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/gravityforms.svg',
  authors: ["Abdallah-Alwarawreh","kishanprmr","MoShizzle","abuaboud"],
  categories: [BlockCategory.FORMS_AND_SURVEYS],
  actions: [],
  triggers: [gravityFormsNewSubmission],
});
