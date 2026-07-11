import { createBlock, BlockAuth } from '@intelblocks/blocks-framework';
import { calculateAverage } from './lib/actions/calculate-average';
import { calculateSum } from './lib/actions/calculate-sum';
import { countUniques } from './lib/actions/count-uniques';
import { getMinMax } from './lib/actions/get-min-max';
import { BlockCategory } from '@intelblocks/shared';

export const dataSummarizer = createBlock({
  displayName: 'Data Summarizer',
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.30.0',
  logoUrl: 'https://cdn.activepieces.com/pieces/data-summarizer.svg',
  authors: ['tahboubali'],
  actions: [calculateAverage, calculateSum, countUniques, getMinMax],
  triggers: [],
  categories: [BlockCategory.CORE]
});
