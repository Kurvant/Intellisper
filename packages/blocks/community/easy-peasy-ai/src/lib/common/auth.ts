import { BlockAuth } from '@intelblocks/blocks-framework';

export const easyPeasyAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description:
    'Easy Peasy AI API Key. Get it from [Easy Peasy AI Settings](https://easy-peasy.ai/settings) - Navigate to the **API** tab from the top bar',
  required: true,
});
