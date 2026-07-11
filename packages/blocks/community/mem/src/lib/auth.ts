import { BlockAuth } from '@intelblocks/blocks-framework';

export const memAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: `You can obtain your API key by navigating to **Integrations→ API**.`,
});
