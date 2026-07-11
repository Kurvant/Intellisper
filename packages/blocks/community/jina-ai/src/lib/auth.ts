import { BlockAuth } from '@intelblocks/blocks-framework';

const markdownDescription = `
You can get your API key from [Jina AI](https://jina.ai).
`;

export const jinaAiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: markdownDescription,
  required: true,
})
