import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockAuth, createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { createOrUpdateContact } from './lib/actions/create-or-update-contact';

export const sendinblueAuth = BlockAuth.SecretText({
  displayName: 'Project API key',
  description: 'Your project API key',
  required: true,
});

export const sendinblue = createBlock({
  displayName: 'Brevo',
  description:
    'Formerly Sendinblue, is a SaaS solution for relationship marketing',
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/brevo.png',
  authors: ["kanarelo","BLaidzX","Salem-Alaa","kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  categories: [BlockCategory.MARKETING],
  auth: sendinblueAuth,
  actions: [
    createOrUpdateContact,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.sendinblue.com/v3',
      auth: sendinblueAuth,
      authMapping: async (auth) => ({
        'api-key': auth.secret_text,
      }),
    }),
  ],
  triggers: [],
});
