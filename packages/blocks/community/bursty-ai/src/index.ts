import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { runWorkflow } from './lib/actions/run-workflow';
import { burstyAiAuth } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';

export const burstyAi = createBlock({
  displayName: 'BurstyAI',
  auth: burstyAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/bursty-ai.png',
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  description:
    "Automate content creation, SEO optimization, email outreach, and influencer partnerships with BurstyAI's no-code AI workflows.",
  authors: ['sanket-a11y'],
  actions: [runWorkflow],
  triggers: [],
});
