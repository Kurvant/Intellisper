import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { sendEmail } from './lib/actions/send-email';
import { mailjetAuth } from './lib/auth';

export const mailjet = createBlock({
  displayName: 'Mailjet',
  description: 'Email delivery service for sending transactional and marketing emails',
  auth: mailjetAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/mailjet.svg',
  categories: [BlockCategory.COMMUNICATION],
  authors: ['christian-schab'],
  actions: [sendEmail],
  triggers: []
});
