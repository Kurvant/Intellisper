
import { createBlock } from "@intelblocks/blocks-framework";
import { swarmnodeAuth } from "./lib/common/auth";
import { getExecutionAction } from "./lib/actions/get-execution";
import { createCustomApiCallAction } from "@intelblocks/blocks-common";
import { BASE_URL } from "./lib/common/constants";
import { executeAgentAction } from "./lib/actions/execute-agent";

export const swarmnode = createBlock({
  displayName: "SwarmNode",
  auth: swarmnodeAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/swarmnode.png",
  authors: ['kishanprmr'],
  actions: [
    executeAgentAction,
    getExecutionAction,
    createCustomApiCallAction({
      auth: swarmnodeAuth,
      baseUrl: () => BASE_URL,
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth.secret_text}`
        }
      }
    })
  ],
  triggers: [],
});
