import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { validateEmail } from './lib/actions/validate-email';
import { validatedMailsAuth } from './lib/common/auth';

export const validatedmails = createBlock({
  displayName: 'ValidatedMails',
  auth: validatedMailsAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/validatedmails.png',
  categories: [BlockCategory.COMMUNICATION],
  description:
    'ValidatedMails validates email addresses in real time and returns status, score, and domain-level deliverability signals.',
  authors: ['fatiht8a'],
  actions: [
    validateEmail,
    createCustomApiCallAction({
      auth: validatedMailsAuth,
      baseUrl: () => 'https://api.validatedmails.com',
      authLocation: 'headers',
      authMapping: async (auth) => {
        return {
          Authorization: `Bearer ${auth.secret_text}`,
        };
      },
    }),
  ],
  triggers: [],
});
