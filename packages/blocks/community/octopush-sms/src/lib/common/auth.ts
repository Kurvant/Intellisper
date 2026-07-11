import { BlockAuth, Property } from '@intelblocks/blocks-framework';

const markdown = `

`;

export const octopushAuth = BlockAuth.CustomAuth({
  description: markdown,
  required: true,
  props: {
    api_login: Property.ShortText({
      displayName: 'API Login',
      description: ' Your Octopush API Login',
      required: true,
    }),
    api_key: BlockAuth.SecretText({
      displayName: 'API Key',
      description: ' Your Octopush API Key',
      required: true,
    }),
  },
});
