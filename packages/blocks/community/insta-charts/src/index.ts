import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { instaChartsGenerateChartImageAction } from "./lib/actions/generate-chart-image";
import { instaChartsAuth } from './lib/auth';

export const instaCharts = createBlock({
  displayName: "InstaCharts",
  description: "Chart creation and visualization platform",
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/insta-charts.png",
  categories: [BlockCategory.MARKETING, BlockCategory.PRODUCTIVITY],
  authors: ['onyedikachi-david'],
  auth: instaChartsAuth,
  actions: [
    instaChartsGenerateChartImageAction,
  ],
  triggers: [],
});