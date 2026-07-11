import { BlockAuth } from '@intelblocks/blocks-framework';

export const chatflyAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Enter your ChatFly API key',
  required: true,
});
