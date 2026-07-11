import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { logrocketAuth } from './lib/common/auth';
import { requestHighlights } from './lib/actions/request-highlights';
import { identifyUser } from './lib/actions/identify-user';
import { highlightsReady } from './lib/triggers/highlights-ready';

export const logrocket = createBlock({
  displayName: 'LogRocket',
  description: 'Get AI-generated summaries of user sessions to understand customer behavior and troubleshoot issues faster.',
  auth: logrocketAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/logrocket.png',
  categories: [BlockCategory.DEVELOPER_TOOLS],
  authors: ["onyedikachi-david"],
  actions: [requestHighlights, identifyUser],
  triggers: [highlightsReady],
});
