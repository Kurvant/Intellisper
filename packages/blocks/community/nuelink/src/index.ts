
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { createPost } from "./lib/actions/create-post";
import { BlockCategory } from "@intelblocks/shared";

export const nuelinkAuth = BlockAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Please use **Nuelink API Key**.',
});

export const nuelink = createBlock({
  displayName: "Nuelink",
  auth: nuelinkAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/nuelink.png",
  categories:[BlockCategory.CONTENT_AND_FILES,BlockCategory.MARKETING],
  authors: ['AouladLahceneOussama'],
  actions: [createPost],
  triggers: [],
});
