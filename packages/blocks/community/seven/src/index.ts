import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { sendSmsAction } from './action/sms-send';
import { sendRcsAction } from './action/rcs-send';
import { sendVoiceCallAction } from './action/send-voice-call';
import { lookup } from './action/lookup';
import { smsInbound } from './trigger/sms-inbound';
import { BlockCategory } from '@intelblocks/shared';
import { sevenAuth } from './lib/auth';

export const seven = createBlock({
  displayName: 'seven',
  description: 'Business Messaging Gateway',
  auth: sevenAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/seven.jpg',
  categories: [BlockCategory.MARKETING],
  authors: ['seven-io'],
  actions: [sendSmsAction, sendVoiceCallAction, lookup, sendRcsAction],
  triggers: [smsInbound],
});
