
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { identifyUser } from "./lib/actions/identify-user";

export const segmentAuth = BlockAuth.SecretText({
  displayName: 'Analytics Key',
  required: true,
  description: 'Copy and paste your analytics write key here',
});


export const segment = createBlock({
  displayName: "Segment",
  auth: segmentAuth,
  minimumSupportedRelease: '0.30.0',
  logoUrl: "https://cdn.activepieces.com/pieces/segment.png",
  authors: ['abuaboud'],
  actions: [identifyUser],
  triggers: [],
});
