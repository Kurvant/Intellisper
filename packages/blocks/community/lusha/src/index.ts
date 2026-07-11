import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { searchCompanies } from "./lib/actions/companies/search";
import { enrichCompanies } from "./lib/actions/companies/enrich";

export const lushaAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Please enter the API Key obtained from Lusha.',
});

export const lusha = createBlock({
  displayName: "Lusha",
  auth: lushaAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/lusha.png",
  authors: ["Kevinyu-alan"],
  actions: [
    searchCompanies,
    enrichCompanies,
    createCustomApiCallAction({
      baseUrl: () => {
        return 'https://api.lusha.com';
      },
      auth: lushaAuth,
      authMapping: async (auth) => ({
        'x-app': 'activepieces',
        'api_key': auth.secret_text,
      }),
    })
  ],
    triggers: [],
});