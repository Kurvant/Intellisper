import { BlockAuth } from '@intelblocks/blocks-framework';

const markdownDescription = `
You can obtain an API key from **Settings->Integrations->API Keys**.
`;

export const instantlyAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: markdownDescription,
  required: true,
})
