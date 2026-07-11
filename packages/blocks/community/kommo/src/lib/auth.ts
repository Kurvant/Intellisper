import { BlockAuth } from '@intelblocks/blocks-framework';

const markdownDescription = `
Please follow [Generate Long Live Token](https://developers.kommo.com/docs/long-lived-token) guide for generating token.

Your Kommo account subdomain (e.g., "mycompany" if your URL is mycompany.kommo.com).

`;

export const kommoAuth = BlockAuth.CustomAuth({
  description: markdownDescription,
  required: true,
  props: {
    subdomain: BlockAuth.SecretText({
      displayName: 'Subdomain',
      required: true,
    }),
    apiToken: BlockAuth.SecretText({
      displayName: 'Token',
      required: true,
    }),
  },
});
