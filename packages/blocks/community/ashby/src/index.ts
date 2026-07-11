import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

export const ashbyAuth = BlockAuth.CustomAuth({
  required: true,
  props: {
    apiKey: BlockAuth.SecretText({
      displayName: 'API key',
      required: true,
    }),
  },
});

export const ashby = createBlock({
  displayName: 'Ashby',
  auth: ashbyAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/ashby.png',
  authors: ['AdamSelene'],
  actions: [
    createCustomApiCallAction({
      baseUrl: () => `https://api.ashbyhq.com/`,
      auth: ashbyAuth,
      authMapping: async (auth) => {
        const { apiKey } = auth.props;
        return {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString(
            'base64'
          )}`,
          'Content-Type': 'application/json',
        };
      },
    }),
  ],
  triggers: [],
});
