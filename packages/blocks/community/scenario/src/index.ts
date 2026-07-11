import {
  createBlock,
  BlockAuth,
  Property,
} from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BasicAuthConnectionValue } from '@intelblocks/shared';

export const scenarioAuth = BlockAuth.BasicAuth({
  description:
    'Follow [these instructions](https://docs.scenario.com/docs/get-api-key) to get your API key',
  required: true,
  username: Property.ShortText({
    displayName: 'API access key',
    description: 'Starts with "api_"',
    required: true,
  }),
  password: BlockAuth.SecretText({
    displayName: 'API secret',
    required: true,
  }),
});

export const scenario = createBlock({
  displayName: 'Scenario',
  auth: scenarioAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/scenario.png',
  authors: ['AdamSelene'],
  actions: [
    createCustomApiCallAction({
      baseUrl: () => `https://api.cloud.scenario.com/v1/`,
      auth: scenarioAuth,
      authMapping: async (auth) => {
        const { username, password } = auth;
        return {
          Authorization: `Basic ${Buffer.from(
            `${username}:${password}`
          ).toString('base64')}`,
        };
      },
    }),
  ],
  triggers: [],
});
