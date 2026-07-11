import { BlockAuth } from '@intelblocks/blocks-framework';

export const comfyIcuAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: `You can obtain API key from [Account Settings](https://comfy.icu/account).`,
});
