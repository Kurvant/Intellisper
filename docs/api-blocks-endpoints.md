# `/v1/blocks` API — endpoint reference (post-rebrand)

The `piece` concept was renamed to `block`. The HTTP surface moved from `/v1/pieces` to
`/v1/blocks` with **no backward-compatibility alias** — any client still calling `/v1/pieces`
receives a `404`.

Three Fastify controllers mount on the same `/v1/blocks` prefix (base, community, platform),
plus one admin route. Together they expose the endpoints below.

---

## Base blocks controller
`packages/server/api/src/app/pieces/metadata/piece-metadata-controller.ts` → prefix `/v1/blocks`

| Method | Path | Purpose | Resource returned |
|---|---|---|---|
| `GET` | `/v1/blocks` | List blocks visible to the caller's project/platform, honouring the platform's block filter (allow/block list) and search/sort query params. | `BlockMetadataModelSummary[]` — trimmed metadata (name, version, displayName, logo, categories, action/trigger counts). Does **not** include full action/trigger props. |
| `GET` | `/v1/blocks/categories` | Enumerate the block category taxonomy used for filtering/browsing. | `BlockCategory[]` — the enum values (e.g. `ARTIFICIAL_INTELLIGENCE`, `COMMUNICATION`, `CORE`, `FLOW_CONTROL`, …). |
| `GET` | `/v1/blocks/registry` | List packages available from the configured block registry (`IB_BLOCKS_REGISTRY_URL`) for install/sync. | `BlockPackageInformation[]` — registry package descriptors (name, version, source). |
| `GET` | `/v1/blocks/:name` | Fetch the **full** metadata for one unscoped block by name (e.g. `slack`). Optional `version` query selects a specific version; otherwise latest. | `BlockMetadataModel` — full metadata **including** every action and trigger with their complete property maps and auth definition. |
| `GET` | `/v1/blocks/:scope/:name` | Same as above for a **scoped** package name (e.g. `@intelblocks/block-slack`). `scope` and `name` are URI-decoded and rejoined as `scope/name`. | `BlockMetadataModel` |
| `POST` | `/v1/blocks/options` | Resolve a block property's dynamic options / dynamic props at design time. Body identifies `flowId`, `flowVersionId`, the step, and the property to resolve. Used by the builder to populate dropdowns. | `ExecutePropsResult` — `{ type, options }` for `DROPDOWN`, `MULTI_SELECT_DROPDOWN`, or `DYNAMIC` properties. |
| `POST` | `/v1/blocks/sync` | Trigger a sync of block metadata from the configured registry into the local `block_metadata` table, then publish a cache refresh. | `void` (202/200); side effect is DB + cache refresh. |
| `POST` | `/v1/blocks` | Install a block. Multipart or JSON body (`AddBlockRequestBody`). Which controller handles it depends on scope (see below). | `BlockMetadataModel` — the newly installed block's metadata. |

### Wire keys on install (`POST /v1/blocks`)
The multipart / body field names were renamed with the concept:

| Old key | New key |
|---|---|
| `pieceName` | `blockName` |
| `pieceVersion` | `blockVersion` |
| `pieceArchive` | `blockArchive` |

Query/filter keys likewise: `pieceName` → `blockName`, `pieces` → `blocks`.

---

## Community blocks controller
`packages/server/api/src/app/pieces/community-piece-module.ts` → prefix `/v1/blocks`

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/v1/blocks` | Install a **community / public-registry** block for the platform. Body: `AddBlockRequestBody`. | Platform-admin only (`USER` or `SERVICE` principal). |

## Platform blocks controller (enterprise)
`packages/server/api/src/app/enterprise/pieces/platform-piece-module.ts` → prefix `/v1/blocks`

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/v1/blocks` | Install an **organization-private** block, scoped to the caller's own organization/platform. Body: `AddBlockRequestBody`. | Platform-admin only (`USER` or `SERVICE` principal). |

> Both community and platform controllers register `POST /` on the same `/v1/blocks` prefix;
> Fastify resolves by registration order + edition. The distinction is *which* install path
> (public registry vs private/archive) and the resulting `blockType` (`OFFICIAL` vs `CUSTOM`).

---

## Admin route
`packages/server/api/src/app/enterprise/platform/admin/admin-platform.controller.ts`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/blocks` (admin prefix, was `/pieces`) | Create/register an **official** block from the admin surface. Body: `CreateOfficialBlockRequest`. |

---

## Notes / gaps found while documenting

1. **No `DELETE /v1/blocks/:id` route exists on the server.** The web client
   (`packages/web/src/features/pieces/api/pieces-api.ts`) has a `delete(id)` method calling
   `DELETE /v1/blocks/:id`, but **no such route was ever registered** — verified against the
   pre-rebrand commit `4ef3a2e4bb`, where `DELETE /v1/pieces/:id` likewise did not exist.
   This is a **pre-existing dead client method**, not a rebrand regression. It should either be
   removed from the client or the route implemented (uninstall a block by its metadata id).

2. `GET /v1/blocks` rejects the legacy `?release=` query param with
   `ErrorCode.BLOCK_SYNC_NOT_SUPPORTED` (the old "sync by release" call shape).

3. Related tag routes live under a separate prefix (`/v1/tags`), not `/v1/blocks`:
   `DELETE /v1/tags/:id` etc. Block↔tag association is stored in the `block_tag` table.

---

## Migration for API consumers

| Old | New |
|---|---|
| `GET /v1/pieces` | `GET /v1/blocks` |
| `GET /v1/pieces/categories` | `GET /v1/blocks/categories` |
| `GET /v1/pieces/registry` | `GET /v1/blocks/registry` |
| `GET /v1/pieces/:name` | `GET /v1/blocks/:name` |
| `GET /v1/pieces/:scope/:name` | `GET /v1/blocks/:scope/:name` |
| `POST /v1/pieces/options` | `POST /v1/blocks/options` |
| `POST /v1/pieces/sync` | `POST /v1/blocks/sync` |
| `POST /v1/pieces` | `POST /v1/blocks` |
| admin `POST /pieces` | admin `POST /blocks` |
