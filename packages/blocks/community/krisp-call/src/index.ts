import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { httpClient, HttpMethod } from '@intelblocks/blocks-common';
import { addContact } from './lib/actions/add-contact';
import { deleteContacts } from './lib/actions/delete-contacts';
import { sendSms } from './lib/actions/send-sms';
import { sendMms } from './lib/actions/send-mms';
import { triggers } from './lib/triggers';
import { BlockCategory } from '@intelblocks/shared';
import { krispcallAuth } from './lib/auth';

export type krispcallAuth = {
  apiKey: string;
};

export const KrispCall = createBlock({
  displayName: 'KrispCall',
  description:
    'KrispCall is a cloud telephony system for modern businesses, offering advanced features for high-growth startups and modern enterprises.',
  categories: [BlockCategory.COMMUNICATION],
  auth: krispcallAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/krispcall.svg',
  authors: ['deependra321'],
  actions: [addContact, deleteContacts, sendSms, sendMms],
  triggers: triggers,
});
