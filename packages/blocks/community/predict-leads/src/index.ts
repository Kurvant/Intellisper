import {
  createBlock,
  BlockAuth,
  BlockPropValueSchema,
} from '@intelblocks/blocks-framework';
import { AppConnectionType, BlockCategory } from '@intelblocks/shared';
import { findCompaniesAction, findCompanyByDomainAction } from './lib/actions/companies';
import { findJobOpeningsAction, getAJobOpeningByIdAction, getCompanyJobOpeningsActions } from './lib/actions/jobs';
import { makeClient } from './lib/common';
import { findTechnologiesByCompanyAction, findCompaniesByTechnologyIdAction } from './lib/actions/technology';
import { findNewsEventByIdAction, findNewsEventsByDomainAction } from './lib/actions/news-events';
import { findConnectionsAction, findConnectionsByDomainAction } from './lib/actions/connections';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { PredictLeadsAuth } from './lib/auth';

export const predictLeads = createBlock({
  displayName: 'PredictLeads',
  auth: PredictLeadsAuth,
  description: `Company Intelligence Data Source`,
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/predict-leads.png',
  categories: [BlockCategory.BUSINESS_INTELLIGENCE, BlockCategory.SALES_AND_CRM, BlockCategory.MARKETING],
  authors: [
    'codegino',
  ],
  actions: [
    findCompaniesAction,
    findCompanyByDomainAction,
    findJobOpeningsAction,
    getCompanyJobOpeningsActions,
    getAJobOpeningByIdAction,
    findTechnologiesByCompanyAction,
    findCompaniesByTechnologyIdAction,
    findNewsEventsByDomainAction,
    findNewsEventByIdAction,
    findConnectionsAction,
    findConnectionsByDomainAction,
    createCustomApiCallAction({
      auth:PredictLeadsAuth,
      baseUrl:()=>'https://predictleads.com/api/v3',
      authMapping: async (auth)=>{
        const authValue = auth.props;
        return{
          'X-Api-Key':authValue.apiKey,
          'X-Api-Token':authValue.apiToken
        }
      }
    })
  ],
  triggers: [],
});
