import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { sendMessage } from './lib/actions/send-message';

export const whatsableAuth = BlockAuth.SecretText({
  displayName: 'Whatsable Auth Token',
  description: 'The auth token for Whatsable',
  required: true,
});

export const whatsable = createBlock({
  displayName: 'Whatsable',
  description: 'Manage your WhatsApp business account',
  auth: whatsableAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/whatsable.png',
  authors: ["abuaboud"],
  actions: [sendMessage],
  triggers: [],
});
