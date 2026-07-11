# MCP Module

## Summary
Exposes an Intellisper project as a Model Context Protocol (MCP) server so that AI clients (Claude Desktop, Cursor, Windsurf) can read and manipulate flows, connections, tables, and other project resources through a typed tool interface. Each project gets exactly one MCP server record with a bearer token for authentication; the server is built per-request from a combination of static locked/controllable tools and dynamic flow-as-tool entries.

## Key Files
- `packages/server/api/src/app/mcp/mcp-service.ts` — server build logic, tool registration, token auth
- `packages/server/api/src/app/mcp/mcp-server-controller.ts` — HTTP endpoints (get, update, rotate, protocol handler, agent validator)
- `packages/server/api/src/app/mcp/mcp-entity.ts` — McpServer entity
- `packages/server/api/src/app/mcp/tools/index.ts` — static tool exports
- `packages/server/api/src/app/mcp/oauth/` — OAuth 2.0 PKCE flow for MCP clients that require OAuth
- `packages/shared/src/lib/automation/mcp/mcp.ts` — McpServer schema, McpToolDefinition type
- `packages/shared/src/lib/automation/mcp/mcp-oauth.ts` — MCP OAuth types
- `packages/web/src/app/components/project-settings/mcp-server/index.tsx` — project settings panel for MCP
- `packages/web/src/app/components/project-settings/mcp-server/mcp-credentials.tsx` — token display and rotate UI
- `packages/web/src/app/components/project-settings/mcp-server/mcp-flows.tsx` — list of flows exposed as tools
- `packages/web/src/app/components/project-settings/mcp-server/mcp-tools.tsx` — controllable tool toggle UI
- `packages/web/src/app/routes/mcp-authorize/index.tsx` — OAuth authorization page for MCP clients
- `packages/web/src/features/agents/agent-tools/mcp-tool-dialog/index.tsx` — dialog to add an external MCP server as an agent tool
- `packages/web/src/features/agents/agent-tools/mcp-tool-dialog/add-mcp-tool-form.tsx` — form inside the dialog
- `packages/web/src/features/agents/agent-tools/components/mcp-tool.tsx` — inline display of an MCP tool in agent settings
- `packages/web/src/app/builder/test-step/custom-test-step/mcp-tool-testing-dialog.tsx` — test an individual MCP tool from the builder

## Edition Availability
- Community (CE): available
- Enterprise (EE): available
- Cloud: available

## Domain Terms
- **McpServer** — the per-project MCP server record (token, disabledTools)
- **Locked tools** — tools that are always active when the MCP server is enabled; cannot be disabled
- **Controllable tools** — tools that platform or project owners can enable/disable individually
- **Dynamic flow tools** — flows that use the MCP trigger block and are registered as callable tools; tool name format is `{toolName}_{flowId[0..4]}`
- **StreamableHTTP** — streaming variant of the MCP protocol used for the primary `/http` endpoint
- **MCP trigger block** — `@intelblocks/block-mcp`; a flow with this trigger is exposed as a callable tool via MCP
- **disabledTools** — JSONB array of controllable tool names currently disabled; `null` or `[]` means all controllable tools are enabled
- **Flow attribution** — `ib_create_flow`, `ib_build_flow`, and `ib_duplicate_flow` stamp `ownerId` (the OAuth-authenticated user who connected the client) and `createdBy: { type: 'MCP', id: <mcpServerId> }` on every flow they create. `ProjectScopedMcpServer` carries `userId?` so the tools can attribute ownership.

## Entity

**McpServer**: id, projectId (UNIQUE — one per project), token (72-char auth), disabledTools[] (JSONB, nullable — defaults to []).

## Tools

**Locked tools** (always enabled if MCP is on):
- `ib_list_flows` — list all flows in project
- `ib_flow_structure` — get flow definition and structure
- `ib_read_step_code` — read full source code of a CODE step
- `ib_validate_flow`, `ib_validate_step_config` — validation helpers
- `ib_research_blocks`, `ib_get_block_props` — block discovery and schema
- `ib_resolve_property_options`, `ib_resolve_property_chain` — dropdown/property resolution
- `ib_list_connections` — list app connections
- `ib_list_ai_models` — list AI providers and models
- `ib_list_tables`, `ib_find_records` — table/record queries
- `ib_list_runs`, `ib_get_run` — run inspection
- `ib_setup_guide` — setup instructions

**Controllable tools** (can be toggled per-project):
- `ib_create_flow`, `ib_rename_flow`, `ib_build_flow`, `ib_delete_flow`, `ib_duplicate_flow` — flow management; `ib_build_flow` returns `flowUrl` (via `domainHelper.getPublicUrl`) in both text and structured output
- `ib_update_trigger` — change flow trigger
- `ib_add_step`, `ib_update_step`, `ib_delete_step` — step management
- `ib_add_branch`, `ib_update_branch`, `ib_delete_branch` — conditional branching
- `ib_lock_and_publish` — publish flow version
- `ib_change_flow_status` — enable/disable flow
- `ib_manage_notes` — add/update flow annotations
- `ib_create_table`, `ib_delete_table` — table management
- `ib_manage_fields`, `ib_insert_records`, `ib_update_record`, `ib_delete_records` — record operations
- `ib_test_flow`, `ib_test_step` — flow/step testing
- `ib_retry_run`, `ib_run_action` — run management

**Dynamic flow tools**: Each enabled flow with MCP trigger block is registered as a callable tool. Name format: `{toolName}_{flowId.substring(0, 4)}`. Execution: submits webhook to flow (sync if `returnsResponse`, async otherwise).

## Tool Pattern

```typescript
{ title: 'ib_xxx', description: '...', inputSchema: zodSchema, annotations: { readOnlyHint, destructiveHint }, execute: async (args) => ({ content: [{ type: 'text', text: '...' }] }) }
```

## Endpoints

- `GET /v1/mcp/:projectId` — get MCP server config + populated flows
- `POST /v1/mcp/:projectId` — update disabledTools
- `POST /v1/mcp/:projectId/rotate` — rotate auth token
- `POST /v1/mcp/:projectId/http` — StreamableHTTP MCP protocol endpoint (main protocol handler)

External MCP server validation for the **agent block** lives under `packages/server/api/src/app/agents/` (endpoint: `POST /v1/projects/:projectId/agent-tools/mcp/validate`), not here — it's a probe for URLs the agent will later connect to, not part of the Intellisper-as-MCP-server feature.

## Authentication

Bearer token (`Authorization: Bearer {token}`) or query param (`?token={token}`). Returns 401 if invalid.

OAuth 2.0 PKCE flow is supported for AI clients that require OAuth. The MCP OAuth module (`mcp-oauth.module.ts`) registers metadata, authorization, token, and revocation endpoints.

**Discovery & base-path awareness** — The OAuth issuer, `authorize`/`token`/`register`/`revoke` endpoints, the `resource`, and the `/mcp-authorize` redirect are built via `domainHelper.getPublicUrlFromRequest({ req, path })`. It keeps the request-derived host (so cloud custom domains still work) but appends the path prefix from `IB_FRONTEND_URL`, so subpath-hosted instances (`host/<prefix>/mcp` behind a reverse proxy) advertise URLs under the prefix. On root deployments the prefix is empty and behavior is unchanged.

**RFC 9728 §5.1** — MCP `401` responses include a `WWW-Authenticate: Bearer resource_metadata="…"` header pointing at the prefixed protected-resource metadata URL (`/.well-known/oauth-protected-resource/mcp` for project, `/mcp/platform` for platform), so clients can locate discovery without guessing host-root well-known paths. Clients that ignore the header and probe host-root well-known paths still require the operator to forward `host/.well-known/oauth-*` to AP (that namespace is host-root-anchored by RFC 8414/9728).

## Server Building

`mcpServerService.buildServer()` — built per-request:
1. Creates `McpServer` instance with metadata (name, version, icons)
2. Registers dynamic flow tools (from MCP trigger flows)
3. Registers controllable + locked static tools
4. Registers empty resources/prompts (MCP spec compliance)

## Agent Integration

AI blocks use MCP tools via 3 transport protocols:
- `SIMPLE_HTTP` — basic HTTP
- `STREAMABLE_HTTP` — streaming with `StreamableHTTPClientTransport`
- `SSE` — server-sent events
