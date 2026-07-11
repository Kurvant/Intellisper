import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { newFormResult } from './lib/triggers/new-form-result';
import { BlockCategory } from '@intelblocks/shared';

export const formsiteAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Formsite API Key',
  required: true,
});

export const formsite = createBlock({
  displayName: 'Formsite',
  auth: BlockAuth.None(),
  description:
    'Formsite is an online form builder that allows you to create forms and surveys easily.',
  categories: [BlockCategory.SALES_AND_CRM],
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/formsite.png',
  authors: ['sanket-a11y'],
  actions: [],
  triggers: [newFormResult],
});
