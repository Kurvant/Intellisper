import { createBlock } from '@intelblocks/blocks-framework';
import { renderTemplate } from './actions/renderTemplate.action';
import { BlockCategory } from '@intelblocks/shared';
import { generatebannersAuth } from './src/index';
export const generatebanners = createBlock({
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/generatebanners.png',
  authors: ['tpatel'],
  categories: [BlockCategory.MARKETING],
  actions: [renderTemplate],
  displayName: 'GenerateBanners',
  triggers: [],
  auth: generatebannersAuth,
});
