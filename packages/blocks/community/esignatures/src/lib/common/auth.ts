import { BlockAuth } from '@intelblocks/blocks-framework';

export const esignaturesAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  description: 'Esignatures API Key',
  required: true,
});
