import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  OAuth2PropertyValue,
  BlockAuth,
  createBlock,
} from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { asanaCreateTaskAction } from './lib/actions/create-task';
import { asanaAuth } from './lib/auth';

export const asana = createBlock({
  displayName: 'Asana',
  description: "Work management platform designed to help teams organize, track, and manage their work.",
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/asana.png',
  categories: [BlockCategory.PRODUCTIVITY],
  authors: ["ShayPunter","kishanprmr","MoShizzle","khaledmashaly","abuaboud"],
  auth: asanaAuth,
  actions: [
    asanaCreateTaskAction,
    createCustomApiCallAction({
      baseUrl: () => `https://app.asana.com/api/1.0`,
      auth: asanaAuth,
      authMapping: async (auth) => ({
        Authorization: `Bearer ${(auth as OAuth2PropertyValue).access_token}`,
      }),
    }),
  ],
  triggers: [],
});
