
    import { createBlock } from "@intelblocks/blocks-framework";
import { BlockCategory } from "@intelblocks/shared";
import { phoneValidatorAuth } from './lib/common/auth';
import { validatePhone } from './lib/actions';

export const phoneValidator = createBlock({
  displayName: "Phone Validator",
  description: "Validate phone numbers and retrieve line type, carrier, and location information",
  auth: phoneValidatorAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/phone-validator.png",
  categories: [BlockCategory.COMMUNICATION],
  authors: ['onyedikachi-david'],
  actions: [validatePhone],
  triggers: [],
});
