
import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { query } from "./lib/actions/query";
import { BlockCategory } from "@intelblocks/shared";
    
    export const graphql = createBlock({
      displayName: "GraphQL",
      auth: BlockAuth.None(),
      minimumSupportedRelease: '0.30.0',
      logoUrl: "https://cdn.activepieces.com/pieces/graphql.svg",
      categories:[BlockCategory.CORE],
      authors: ['mahmuthamet'],
      actions: [query],
      triggers: [],
    });
    