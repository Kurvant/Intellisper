import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import {
  createBlock,
  BlockAuth,
  Property,
} from '@intelblocks/blocks-framework';
import { BlockCategory } from '@intelblocks/shared';
import { moxieCreateClientAction } from './lib/actions/create-client';
import { moxieCreateProjectAction } from './lib/actions/create-project';
import { moxieCreateTaskAction } from './lib/actions/create-task';
import { moxieCRMTriggers } from './lib/triggers';
import { moxieCRMAuth } from './lib/auth';
export const moxieCrm = createBlock({
  displayName: 'Moxie',
  description: 'CRM build for the freelancers.',

  auth: moxieCRMAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/moxie-crm.png',
  authors: ["kishanprmr","MoShizzle","abuaboud"],
  categories: [BlockCategory.SALES_AND_CRM],
  actions: [
    moxieCreateClientAction,
    moxieCreateTaskAction,
    moxieCreateProjectAction,
    createCustomApiCallAction({
      baseUrl: (auth) => (auth?.props.baseUrl ?? ''),
      auth: moxieCRMAuth,
      authMapping: async (auth) => ({
        'X-API-KEY': (auth.props.apiKey),
      }),
    }),
  ],
  triggers: moxieCRMTriggers,
});
