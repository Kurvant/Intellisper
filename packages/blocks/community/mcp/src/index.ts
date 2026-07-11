import { createBlock, BlockAuth } from "@intelblocks/blocks-framework";
import { replyToMcpClient } from "./lib/actions/reply-to-mcp-client";
import { mcpTool } from "./lib/triggers/mcp-tool";
import { BlockCategory } from "@intelblocks/shared";

export const mcp = createBlock({
  displayName: "MCP",
  auth: BlockAuth.None(),
  minimumSupportedRelease: '0.50.2',
  logoUrl: "https://cdn.activepieces.com/pieces/new-core/mcp.svg",
  authors: ['Gamal72', 'hazemadelkhalel'],
  description: 'Connect to your hosted MCP Server using any MCP client to communicate with tools',
  actions: [replyToMcpClient],
  triggers: [mcpTool],
  categories: [BlockCategory.ARTIFICIAL_INTELLIGENCE,BlockCategory.UNIVERSAL_AI]
});
