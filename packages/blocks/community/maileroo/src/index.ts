import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { sendEmail } from './lib/actions/send-email';
import { sendFromTemplate } from './lib/actions/send-from-template';
import { verifyEmail } from './lib/actions/verify-email';
import { mailerooAuth } from './lib/auth';

export const maileroo = createBlock({
  displayName: 'Maileroo',
  auth: mailerooAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/maileroo.png',
  categories: [
    BlockCategory.MARKETING,
    BlockCategory.BUSINESS_INTELLIGENCE,
    BlockCategory.COMMUNICATION,
  ],
  description: 'Email Delivery Service with Real-Time Analytics and Reporting',
  authors: ['codegino'],
  actions: [sendEmail, sendFromTemplate, verifyEmail],
  triggers: [],
});
