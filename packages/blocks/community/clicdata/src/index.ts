import { createBlock } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { clicdataAuth } from "./lib/common/auth";
import { insertRow, refreshTable } from "./lib/actions";

export const clicdata = createBlock({
  displayName: "Clicdata",
  auth: clicdataAuth,
  minimumSupportedRelease: '0.36.1',
  description: "ClicData enables True Performance with an end-to-end data analytics platform: connect, transform, automate, visualize and share data from 300+ sources.",
  logoUrl: "https://cdn.activepieces.com/pieces/clicdata.png",
  categories: [BlockCategory.BUSINESS_INTELLIGENCE],
  authors: ["onyedikachi-david"],
  actions: [insertRow, refreshTable],
  triggers: [],
});
