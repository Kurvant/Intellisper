import {
  BlockAuth,
  Property,
  createBlock,
} from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { sendNotification } from './lib/actions/send-notification';
import { gotifyAuth } from './lib/auth';

export const gotify = createBlock({
  displayName: 'Gotify',
  description: 'Self-hosted push notification service',

  logoUrl: 'https://cdn.activepieces.com/pieces/gotify.png',
  minimumSupportedRelease: '0.30.0',
  categories: [BlockCategory.DEVELOPER_TOOLS],
  authors: ["MyWay","kishanprmr","khaledmashaly","abuaboud"],
  auth: gotifyAuth,
  actions: [sendNotification],
  triggers: [],
});
