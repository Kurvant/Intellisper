import { BlockAuth } from '@intelblocks/blocks-framework';

export const extractaAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Enter your Extracta-ai API key',
});

export type ExtractaAiAuth = string;
