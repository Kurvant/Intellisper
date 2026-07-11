import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { createCustomApiCallAction } from '@intelblocks/blocks-common';

export const callRoundedAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Please enter the API Key obtained from Call Rounded.',
});

export const callRounded = createBlock({
  displayName: "Call-rounded",
  auth: callRoundedAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/call-rounded.png",
  authors: ["perrine-pullicino-alan"],
  actions: [
    createCustomApiCallAction({
      baseUrl: () => {
        return "https://api.callrounded.com/v1";
      },
      auth: callRoundedAuth,
      authMapping: async (auth) => ({
        'x-app': 'activepieces',
        'x-api-key': auth.secret_text,
      }),
    })
  ],
    triggers: [],
});
