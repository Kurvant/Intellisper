import { BlockAuth } from '@intelblocks/blocks-framework';

export const digitalPilotAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Enter your DigitalPilot API key',
  required: true,
});
