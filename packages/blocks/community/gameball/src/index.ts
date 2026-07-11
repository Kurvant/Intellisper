
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { sendEvent } from "./lib/actions/send-event";

export const gameballAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Please use your gameball api key. visit [help center](https://help.gameball.co/en/articles/3467114-get-your-account-integration-details-api-key-and-transaction-key) for more information',
});

export const gameball = createBlock({
  displayName: "Gameball",
  auth: gameballAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: "https://cdn.activepieces.com/pieces/gameball.png",
  authors: ["Raamyy"],
  actions: [sendEvent],
  triggers: [],
});
