import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { catchWebhook } from './lib/triggers/catch-hook';
import { BlockCategory } from '@intelblocks/shared';
import { returnResponse } from './lib/actions/return-response';
import { returnResponseAndWaitForNextWebhook } from './lib/actions/return-response-and-wait-for-next-webhook';

export const webhook = createBlock({
  displayName: 'Webhook',
  description: 'Receive HTTP requests and trigger flows using unique URLs.',
  auth: BlockAuth.None(),
  categories: [BlockCategory.CORE],
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/new-core/webhooks.svg',
  authors: ['abuaboud', 'pfernandez98', 'kishanprmr','AbdulTheActivePiecer'],
  actions: [returnResponse,returnResponseAndWaitForNextWebhook],
  triggers: [catchWebhook],
});
