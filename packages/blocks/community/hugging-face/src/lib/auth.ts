import { BlockAuth } from '@intelblocks/blocks-framework';

export const huggingFaceAuth = BlockAuth.SecretText({
  displayName: 'API Token',
  description:
    'Your Hugging Face API token (get it from https://huggingface.co/settings/tokens)',
  required: true,
});
