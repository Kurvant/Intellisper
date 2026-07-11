import { BlockAuth } from '@intelblocks/blocks-framework';

export const munaAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description:
    'Go to [Muna Settings → Developer](https://muna.ai/settings/developer) to generate an access key.',
  required: true,
});
