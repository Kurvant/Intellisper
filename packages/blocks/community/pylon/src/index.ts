
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

const auth = BlockAuth.SecretText({
  displayName: "API Key",
  required: true,
})
export const pylon = createBlock({
  displayName: "Pylon",
  auth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/pylon.png",
  authors: [],
  actions: [
    createCustomApiCallAction({
      auth: auth,
      baseUrl: () => 'https://api.usepylon.com',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth.secret_text}`,
        };
      },
    })
  ],
  triggers: [],
});
