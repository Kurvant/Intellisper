import { BlockAuth } from '@intelblocks/blocks-framework';

export const vadooAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: `You can create API key from [Profile Settings](https://ai.vadoo.tv/profile).`,
});
