import { createBlock } from '@intelblocks/blocks-framework';
import { callMethod } from './lib/actions/call-method';
import { soapAuth } from './lib/shared/auth';

export const soap = createBlock({
  displayName: 'SOAP',
  description:
    'Simple Object Access Protocol for communication between applications',

  auth: soapAuth(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/soap.png',
  authors: ["x7airworker","kishanprmr","abuaboud"],
  categories: [],
  actions: [callMethod],
  triggers: [],
});
