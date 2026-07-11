
    import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { manualTrigger } from "./lib/triggers/manual-trigger";
import { BlockCategory } from "@intelblocks/shared";

export const manualTriggerPiece = createBlock({
      displayName: "Manual Trigger",
      auth: BlockAuth.None(),
      minimumSupportedRelease: '0.78.0',
      logoUrl: "https://cdn.activepieces.com/pieces/new-core/manual-trigger.svg",
      authors: ['AbdulTheActivePiecer'],
      actions: [],
      triggers: [manualTrigger],
      categories:[BlockCategory.CORE]
    });
    