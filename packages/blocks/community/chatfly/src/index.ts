import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { sendMessageAction } from "./lib/actions/send-message";
import { BlockCategory } from "@intelblocks/shared";
import { chatflyAuth } from './lib/auth';

export const chatfly = createBlock({
  displayName: "Chatfly",
  description: "ChatFly allows you to build AI chatbots trained on your data.",
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  auth: chatflyAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/chatfly.png",
  authors: ["onyedikachi-david"],
  actions: [sendMessageAction],
  triggers: [],
});
