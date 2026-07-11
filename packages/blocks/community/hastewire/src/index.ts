
import { createBlock } from "@intelblocks/blocks-framework";
import { hastewireAuth } from "./lib/common/auth";
import { BlockCategory } from "@intelblocks/shared";
import { detectTextAction } from "./lib/actions/detect-text";
import { humanizeTextAction } from "./lib/actions/humanize-text";

export const hastewire = createBlock({
  displayName: "Hastewire",
  auth: hastewireAuth,
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE],
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/hastewire.png",
  authors: ['kishanprmr'],
  actions: [detectTextAction,humanizeTextAction],
  triggers: [],
});
