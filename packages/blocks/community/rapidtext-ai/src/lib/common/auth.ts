import { BlockAuth } from '@intelblocks/blocks-framework';

export const rapidTextAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: `You can obtain your API key from [Dashboard Settings](app.rapidtextai.com).`,
  required: true,
});
