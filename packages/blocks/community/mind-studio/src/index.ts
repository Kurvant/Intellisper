
import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { runWorkflowAction } from './lib/actions/run-workflow';
import { BlockCategory } from '@intelblocks/shared';

export const mindStudioAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Your MindStudio API key (Bearer token).',
  required: true,
});

export const mindStudio = createBlock({
  displayName: 'MindStudio',
  description: 'Run MindStudio workflows and get AI results.',
  auth: mindStudioAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/mind-studio.png',
  authors: ['onyedikachi-david'],
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  actions: [runWorkflowAction],
  triggers: [],
});
    