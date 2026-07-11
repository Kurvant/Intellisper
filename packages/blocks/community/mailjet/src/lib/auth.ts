import { BlockAuth } from '@intelblocks/blocks-framework';

export const mailjetAuth = BlockAuth.BasicAuth({
  description: 'Enter your api credentials',
  required: true,
  username: {
    displayName: 'API Key',
    description: 'Enter your API Key here'
  },
  password: {
    displayName: 'API Secret',
    description: 'Enter your API Secret here'
  }
});
