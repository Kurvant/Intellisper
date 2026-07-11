import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createApprovalLink } from './lib/actions/create-approval-link';
import { waitForApprovalLink } from './lib/actions/wait-for-approval';

export const approval = createBlock({
  displayName: 'Approval (Legacy)',
  description: 'Build approval process in your workflows',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/approvals.svg',
  authors: ["kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  categories: [BlockCategory.CORE, BlockCategory.FLOW_CONTROL],
  actions: [waitForApprovalLink, createApprovalLink],
  triggers: [],
});
