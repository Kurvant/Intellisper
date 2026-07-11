
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { createConversationWithSingleAgent } from "./lib/actions/create-conversation-with-single-agent";
import { sendMessageToExistingConversation } from "./lib/actions/send-message-to-existing-conversation";
import { findMessage } from "./lib/actions/find-message";
import { searchAgents } from "./lib/actions/search-agents";
import { findConversation } from "./lib/actions/find-conversation";
import { newAgent } from "./lib/triggers/new-agent";
import { newConversation } from "./lib/triggers/new-conversation";
import { AgentXAuth } from "./lib/common/auth";
import { BlockCategory } from "@intelblocks/shared";


export const agentx = createBlock({
  displayName: "AgentX",
  auth: AgentXAuth,
  minimumSupportedRelease: '0.36.1',
  categories:[BlockCategory.ARTIFICIAL_INTELLIGENCE],
  logoUrl: "https://cdn.activepieces.com/pieces/agentx.png",
  authors: ['Niket2035','sanket-a11y'],
  actions: [createConversationWithSingleAgent, sendMessageToExistingConversation, findMessage, searchAgents,findConversation],
  triggers: [newAgent,newConversation],
});
