import { BlockAuth } from "@intelblocks/blocks-framework";

export const circleAuth = BlockAuth.SecretText({
  displayName: 'API Token',
  description: `You can obtain your API token by navigating to **Settings->Developers->Tokens**.`,
  required: true,
});