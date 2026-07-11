# Block Management

## Summary
The blocks feature manages the metadata catalog of automation integrations (called "blocks") and exposes APIs for listing, fetching, versioning, and installing custom blocks. Blocks are stored in `piece_metadata` and served via an in-memory cache (`pieceCache`) that is rebuilt from the database on startup and refreshed via a pub/sub channel. Platform admins can install private (custom) blocks by uploading a tarball or referencing an NPM package; these are scoped to the platform with a `platformId`. The `options` endpoint runs dynamic block property evaluation on a worker.

## Key Files
- `packages/server/api/src/app/pieces/metadata/piece-metadata-controller.ts` — all block routes registered under `/v1/blocks`
- `packages/server/api/src/app/pieces/metadata/piece-metadata-service.ts` — list, get, create, delete block metadata; manages cache interactions and block tag enrichment
- `packages/server/api/src/app/pieces/metadata/piece-metadata-entity.ts` — `block_metadata` TypeORM entity
- `packages/server/api/src/app/pieces/metadata/piece-cache.ts` — Redis/memory cache with pub/sub invalidation
- `packages/server/api/src/app/pieces/community-piece-module.ts` — POST `/v1/blocks` for installing custom blocks
- `packages/server/api/src/app/pieces/piece-install-service.ts` — saves archive, calls engine to extract metadata, stores result
- `packages/server/api/src/app/pieces/piece-sync-service.ts` — syncs canonical block registry from NPM/bundled artifacts into DB
- `packages/server/api/src/app/blocks/tags/` — tag entity, tag service, tag-module for organizing blocks into groups
- `packages/web/src/features/pieces/api/pieces-api.ts` — frontend HTTP client
- `packages/web/src/features/pieces/hooks/pieces-hooks.ts` — React Query hooks for block listing, block model, block options
- `packages/web/src/features/pieces/hooks/use-piece-output-schema.ts` — reads `outputSchema` for a given step (PIECE action or trigger) off the cached block model; shares the existing `['block', name, version]` React Query cache so no extra network call is made
- `packages/web/src/features/blocks/components/` — `BlockIcon`, `BlockIconList`, `BlockSelectorSearch`, `InstallPieceDialog`
- `packages/blocks/framework/src/lib/output-schema.ts` — `OutputSchema` / `OutputSchemaField` / `FieldFormat` plain TypeScript types (embedded into the block metadata via `z.custom`)

## Edition Availability
All editions. Block filtering by allowed/blocked list and EE-specific filtering are gated in `enterpriseFilteringUtils` but the base listing and installation is Community-level.

## Domain Terms
- **Block** — a named integration (e.g. `@intelblocks/block-gmail`) providing actions and triggers
- **BlockType** — `OFFICIAL` (bundled) or `CUSTOM` (platform-installed)
- **PackageType** — `REGISTRY` (NPM) or `ARCHIVE` (uploaded tarball)
- **pieceCache** — an in-memory map of block metadata keyed by name+version+platformId, rebuilt from DB
- **BlockCategory** — enum grouping blocks (AI, CORE, COMMUNICATION, etc.)
- **SuggestionType** — AGENT or ACTION; changes ordering in block selector
- **OutputSchema** — optional, per-action / per-trigger structured description of how the step's output should be rendered. Shape: `{ fields: OutputSchemaField[] }`. Each `OutputSchemaField` carries `key`, optional `label` / `value` (path override) / `description`, an optional `format` (`email` / `url` / `date` / `datetime` / `number` / `boolean` / `image` / `html` / `currency` / `filesize` / `duration`), optional `currency` ISO code, optional `dynamicKey: true` for map-shaped values, and optional recursive `children` / `listItems` for nested objects and array-of-record shapes. Set by the block author as the `outputSchema` of `createAction` / `createTrigger`. Consumed by the builder's `SmartOutputViewer` and the data selector — see [flows.md](./flows.md). Opt-in and non-breaking: blocks without an output schema render exactly as before.

## Entity

### `piece_metadata` (`BlockMetadataEntity`)
| Column | Type | Notes |
|---|---|---|
| id | string | ApId |
| name | string | e.g. `@intelblocks/block-gmail` |
| displayName | string | |
| version | string | semver, collation-sorted |
| authors | string[] | |
| logoUrl | string | |
| description | string (nullable) | |
| platformId | string (nullable) | null = official; set = custom block for that platform |
| actions | json | map of action definitions (each may include an optional `outputSchema` blob) |
| triggers | json | map of trigger definitions (each may include an optional `outputSchema` blob) |
| auth | json (nullable) | auth property definition |
| blockType | string | `OFFICIAL` or `CUSTOM` |
| packageType | string | `REGISTRY` or `ARCHIVE` |
| archiveId | ApId (nullable) | FK to `file` for ARCHIVE type |
| categories | string[] (nullable) | |
| minimumSupportedRelease | string | semver |
| maximumSupportedRelease | string | semver |
| projectUsage | number | usage counter |
| i18n | json (nullable) | translation map |

Unique index on `(name, version, platformId)`.

## Endpoints

| Method | Path | Security | Description |
|---|---|---|---|
| GET | `/v1/blocks` | unscoped (all principals) | List blocks with optional filtering (categories, search, suggestionType, locale) |
| GET | `/v1/blocks/categories` | public | Return all `BlockCategory` values |
| GET | `/v1/blocks/registry` | unscoped (all principals) | Registry manifest (name+version) for a given release |
| GET | `/v1/blocks/:name` | unscoped | Get full block metadata by name (latest or pinned version) |
| GET | `/v1/blocks/:scope/:name` | unscoped | Get block with scoped name (e.g. `@org/block`) |
| GET | `/v1/blocks/:name/versions` | project (USER, QUERY) | List all available versions for a block |
| GET | `/v1/blocks/:scope/:name/versions` | project (USER, QUERY) | Versions for scoped block name |
| POST | `/v1/blocks/sync` | publicPlatform (USER) | Trigger registry re-sync |
| POST | `/v1/blocks/options` | project (USER, BODY) | Evaluate dynamic block property options (dropdown values) |
| POST | `/v1/blocks` | platformAdminOnly (USER, SERVICE) | Install a custom block onto the platform |

## Service Methods

### `pieceMetadataService`
- `list(params)` — returns filtered + sorted `BlockMetadataModelSummary[]` from cache; applies platform block filters and EE filtering
- `getOrThrow({ platformId, name, version, locale? })` — returns full `BlockMetadataModel` for exact block; prefers platform-specific over official; applies i18n translation
- `listVersions({ name, platformId, projectId })` — returns all available semver versions from registry cache
- `create({ pieceMetadata, packageType, platformId, blockType, archiveId? })` — inserts metadata record and invalidates cache
- `registry({ release? })` — returns lightweight name+version list for all blocks

### `pieceInstallService`
- `installPiece(platformId, params)` — saves archive file if needed, dispatches `EXECUTE_METADATA` engine job to extract block metadata from the package, then stores via `pieceMetadataService.create`

### `pieceSyncService`
- `sync({ publishCacheRefresh })` — reads bundled block registry file, upserts official block metadata records, optionally publishes cache refresh event
