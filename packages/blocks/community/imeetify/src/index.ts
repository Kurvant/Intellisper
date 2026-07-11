import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { appointmentEvent } from './lib/triggers/appointment-event';

export const imeetify = createBlock({
  displayName: 'iMeetify',
  description:
    'Online appointment scheduling: receive appointment confirmation and cancellation events via webhook.',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/imeetify.png',
  categories: [BlockCategory.PRODUCTIVITY],
  authors: ['sanket-a11y'],
  actions: [],
  triggers: [appointmentEvent],
});
