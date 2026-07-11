
import { createBlock } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { generateAnswerAction } from "./lib/actions/generate-answer";
import { createCustomApiCallAction } from "@intelblocks/blocks-common";
import { dashworksAuth } from "./lib/common/auth";

export const dashworks = createBlock({
  displayName: "Dashworks",
  categories: [BlockCategory.PRODUCTIVITY],
  auth: dashworksAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/dashworks.png",
  authors: ["kishanprmr"],
  actions: [generateAnswerAction,
    createCustomApiCallAction({
      auth: dashworksAuth,
      baseUrl: () => 'https://api.dashworks.ai/v1/',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth.secret_text}`
        }
      }
    })
  ],
  triggers: [],
});
