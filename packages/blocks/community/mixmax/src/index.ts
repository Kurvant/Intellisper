import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { createBlock } from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';

import { createCodeSnippet } from './lib/actions/create-code-snippet';
import { createContact } from './lib/actions/create-contact';
import { findContact } from './lib/actions/find-contact';
import { listCodeSnippets } from './lib/actions/list-code-snippets';
import { listContacts } from './lib/actions/list-contacts';
import { mixmaxAuth } from './lib/auth';

export { mixmaxAuth } from './lib/auth';

export const mixmax = createBlock({
  displayName: 'Mixmax',
  description:
    'Email productivity and automation platform for Gmail — sequences, tracking, templates, and integrations',
  auth: mixmaxAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/mixmax.png',
  categories: [BlockCategory.COMMUNICATION],
  authors: ['tarai-dl', 'onyedikachi-david'],
  actions: [
    createContact,
    findContact,
    listContacts,
    createCodeSnippet,
    listCodeSnippets,
    createCustomApiCallAction({
      baseUrl: () => 'https://api.mixmax.com/v1',
      auth: mixmaxAuth,
      authMapping: async (auth) => ({
        'X-API-Token': auth.secret_text,
      }),
    }),
  ],
  triggers: [],
});
