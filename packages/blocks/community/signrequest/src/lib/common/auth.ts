import { BlockAuth } from '@intelblocks/blocks-framework';

export const signrequestAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Signrequest API Key',
  required: true,
});
