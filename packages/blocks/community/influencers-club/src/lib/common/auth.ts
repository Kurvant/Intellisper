import { BlockAuth } from "@intelblocks/blocks-framework";

export const influencersClubAuth = BlockAuth.SecretText({
  displayName: "Influencers Club API Key",
  description: "API Key for Influencers Club",
  required: true,
});