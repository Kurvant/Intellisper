import { createBlock } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { tenzoAuth } from "./lib/common/auth";
import { newDailyForecastTrigger } from "./lib/triggers/new-daily-forecast.trigger";
import { newSummaryPaymentsTrigger } from "./lib/triggers/new-summary-payments.trigger";
import { newSummarySalesTrigger } from "./lib/triggers/new-summary-sales.trigger";

export { tenzoAuth };

export const tenzo = createBlock({
  displayName: "Tenzo",
  description: "Extract data and insights from the Tenzo platform for sales, forecasting, and analytics.",
  auth: tenzoAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/tenzo.png",
  categories: [BlockCategory.BUSINESS_INTELLIGENCE],
  authors: ["onyedikachi-david"],
  actions: [],
  triggers: [newDailyForecastTrigger, newSummaryPaymentsTrigger, newSummarySalesTrigger],
});
