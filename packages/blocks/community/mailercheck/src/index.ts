import { createBlock } from '@intelblocks/blocks-framework';
import { mailercheckAuth } from './lib/common/auth';
import { verifyAnEmailAddress } from './lib/actions/verify-an-email-address';
import { BlockCategory } from '@intelblocks/shared';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

export const mailercheck = createBlock({
  displayName: 'Mailercheck',
  auth: mailercheckAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/mailercheck.png',
  categories: [BlockCategory.SALES_AND_CRM],
  description:
    'MailerCheck is an easy-to-use email and campaign analysis tool. Anyone using an email service provider can keep their email lists clean and their campaigns deliverable.',
  authors: ['sanket-a11y'],
  actions: [
    verifyAnEmailAddress,
    createCustomApiCallAction({
      auth: mailercheckAuth,
      baseUrl: () => 'https://app.mailercheck.com/api',
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [],
});
