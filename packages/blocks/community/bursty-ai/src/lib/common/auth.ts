import { BlockAuth } from "@intelblocks/blocks-framework";

export const burstyAiAuth = BlockAuth.SecretText({
  displayName: "API Key",
  description: "API Key for Bursty-ai",
  required: true,
});