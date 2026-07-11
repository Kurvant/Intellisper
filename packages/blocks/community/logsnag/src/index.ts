import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { createEvent } from './lib/actions/create-event';
import { newEventCreated } from './lib/triggers/new-event-created';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

export const logsnagAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Your LogSnag API key specific to the project',
});

export const logsnag = createBlock({
  displayName: 'LogSnag',
  auth: logsnagAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/logsnag.png',
  authors: [],
  actions: [
    createEvent,
    createCustomApiCallAction({
      auth: logsnagAuth,
      baseUrl: () => 'https://api.logsnag.com/v1',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth.secret_text}`,
        };
      },
    }),
  ],
  triggers: [newEventCreated],
});
