import { createBlock } from '@intelblocks/blocks-framework';
import { millionVerifierAuth } from './lib/common/auth';
import { BlockCategory } from '@intelblocks/shared';
import { verifyEmail } from './lib/actions/verify-email';

export const millionverifier = createBlock({
  displayName: 'MillionVerifier',
  auth: millionVerifierAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/millionverifier.png',
  authors: ['sanket-a11y'],
  categories: [BlockCategory.COMMUNICATION],
  description: 'MillionVerifier is an email verifier service and API',
  actions: [verifyEmail],
  triggers: [],
});
