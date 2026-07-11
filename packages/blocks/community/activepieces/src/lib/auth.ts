import { BlockAuth, Property } from '@intelblocks/blocks-framework';

const markdown = `
Activepieces Platform API is available under the Platform Edition.
(https://www.activepieces.com/docs/admin-console/overview)

**Note**: The API Key is available in the Platform Dashboard.

`;

export const activePieceAuth = BlockAuth.CustomAuth({
  description: markdown,
  required: true,
  props: {
    baseApiUrl: Property.ShortText({
      displayName: 'Base URL',
      required: true,
      defaultValue: 'https://cloud.activepieces.com/api/v1',
    }),
    apiKey: BlockAuth.SecretText({
      displayName: 'API Key',
      required: true,
    }),
  },
});
