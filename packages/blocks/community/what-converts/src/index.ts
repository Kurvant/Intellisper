import { createBlock } from '@intelblocks/blocks-framework';
import { whatConvertsAuth } from '../src/lib/common/auth';
import { createLeadAction } from '../src/lib/actions/create-lead';
import { exportLeadsAction } from '../src/lib/actions/create-export';
import { updateLeadAction } from '../src/lib/actions/update-lead';
import { findLeadAction } from '../src/lib/actions/find-lead';
import { newLeadTrigger } from '../src/lib/triggers/new-lead';
import { updatedLeadTrigger } from '../src/lib/triggers/update-lead';
import { BlockCategory } from '@intelblocks/shared';

export const whatConverts = createBlock({
  displayName: 'WhatConverts',
  auth: whatConvertsAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/what-converts.png',
  authors: ['Prabhukiran161', 'sanket-a11y'],
  categories: [BlockCategory.SALES_AND_CRM, BlockCategory.MARKETING],
  actions: [
    createLeadAction,
    exportLeadsAction,
    updateLeadAction,
    findLeadAction,
  ],
  triggers: [newLeadTrigger, updatedLeadTrigger],
});
