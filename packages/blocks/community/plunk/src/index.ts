import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  createBlock,
} from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { sendTransactionalEmail } from './lib/actions/send-email';
import { trackEvent } from './lib/actions/track-event';
import { getContacts } from './lib/actions/get-contacts';
import { getContact } from './lib/actions/get-contact';
import { PLUNK_BASE_URL, plunkAuth } from './lib/auth';

export const plunk = createBlock({
  displayName: 'Plunk',
  description:
    'Open-source email platform for transactional emails, marketing campaigns, and contact management.',
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/plunk.png',
  categories: [BlockCategory.MARKETING, BlockCategory.COMMUNICATION],
  authors: ['fran-mora'],
  auth: plunkAuth,
  actions: [
    sendTransactionalEmail,
    trackEvent,
    getContacts,
    getContact,
    createCustomApiCallAction({
      baseUrl: () => PLUNK_BASE_URL,
      auth: plunkAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.props.secretKey}`,
      }),
    }),
  ],
  triggers: [],
});
