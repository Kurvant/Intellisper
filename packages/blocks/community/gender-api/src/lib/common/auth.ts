import { BlockAuth } from '@intelblocks/blocks-framework';

export const genderApiAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'The API key for accessing the Gender-api service',
  required: true,
});
