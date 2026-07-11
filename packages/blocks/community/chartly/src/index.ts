import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { chartlyAuth } from "./lib/common/auth";
import { createChartAction } from "./lib/actions/create-chart";
import { getChartAction } from "./lib/actions/get-chart";

export const chartly = createBlock({
  displayName: "Chartly",
  description: "Instant chart images. Zero servers. Transform any Chart.js configuration into cached PNG or SVG images via a simple REST API.",
  auth: chartlyAuth,
  minimumSupportedRelease: '0.36.1',
  categories: [BlockCategory.DEVELOPER_TOOLS, BlockCategory.CONTENT_AND_FILES],
  logoUrl: "https://cdn.activepieces.com/pieces/chartly.png",
  authors: ['onyedikachi-david'],
  actions: [createChartAction, getChartAction],
  triggers: [],
});
