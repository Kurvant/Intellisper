import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  BlockAuth,
  Property,
  createBlock,
} from '@intelblocks/blocks-framework';
import actions from './lib/actions';
import triggers from './lib/triggers';

const markdown = `
Create an account and obtain the API Key from Pastefy.
`;

export const pastefyAuth = BlockAuth.CustomAuth({
  description: markdown,
  required: true,
  props: {
    instance_url: Property.ShortText({
      displayName: 'Pastefy Instance URL',
      required: false,
      defaultValue: 'https://pastefy.app',
    }),
    token: BlockAuth.SecretText({
      displayName: 'API-Token',
      required: false,
    }),
  },
});

export const pastefy = createBlock({
  displayName: 'Pastefy',
  description: 'Sharing code snippets platform',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/pastefy.png',
  categories: [],
  authors: ["JanHolger","kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  auth: pastefyAuth,
  actions: [
    ...actions,
    createCustomApiCallAction({
      baseUrl: (auth) => {
        if (!auth) {
          return '';
        }
        const typedAuth = auth.props as { instance_url: string };
        return typedAuth.instance_url + '/api/v2';
      },
      auth: pastefyAuth,
      authMapping: async (auth) => {
        const typedAuth = auth as { token?: string };
        return {
          Authorization: typedAuth.token
            ? `Bearer ${typedAuth.token}`
            : undefined,
        };
      },
    }),
  ],
  triggers: triggers,
});
