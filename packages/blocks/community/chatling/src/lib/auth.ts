import { BlockAuth } from '@intelblocks/blocks-framework';
import { HttpMethod } from '@intelblocks/blocks-common';
import { makeRequest } from './common';

const markdownDescription = `
To obtain your API key:

1. Go to your [Chatling account](https://app.chatling.ai)
2. Open **Project Settings**
3. Click the **API Keys** tab
4. Press **New API key** and generate a new key
5. Copy the key (it's only shown once)
`;

export const chatlingAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: markdownDescription,
  required: true,
  validate: async ({ auth }) => {
    try {
      await makeRequest(auth, HttpMethod.GET, '/project/settings');
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        error: 'Invalid API key',
      };
    }
  },
});
