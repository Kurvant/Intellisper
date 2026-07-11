import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { heartBeatCreateUser } from './lib/actions/create-user';

const markdownPropertyDescription = `
  1. Login to your Heartbeat account
  2. On the bottom-left, click on 'Admin Settings'
  3. On the left panel, click on 'API Keys'
  5. Click on 'Create API Key'
  6. On the popup form, Enter the 'Label' to name the Key
  7. Copy the API key and paste it below.
`;

export const heartbeatAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: markdownPropertyDescription,
  required: true,
});

export const Heartbeat = createBlock({
  displayName: 'Heartbeat',
  description: 'Monitoring and alerting made easy',

  auth: heartbeatAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/heartbeat.png',
  categories: [BlockCategory.COMMUNICATION],
  authors: ["kanarelo","kishanprmr","abuaboud"],
  actions: [
    heartBeatCreateUser,
    createCustomApiCallAction({
      auth: heartbeatAuth,
      baseUrl: () => 'https://api.heartbeat.chat/v0',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth.secret_text}`,
        };
      },
    }),
  ],
  triggers: [],
});
