# Onboarding Prompt — Intellisper Codebase

> Copy everything below this line and give it to the agent as its opening prompt.

---

You are about to work on **Intellisper**, a clean-room fork of Activepieces that has
been fully rebranded (product: Intellisper, npm scope: `@intelblocks/*`, concept
rename: **piece → block**, env prefix: **`AP_` → `IB_`**, JWT issuer:
`intellisper`). The repository root is the `blockunits` folder — work ONLY inside it.
Everything in this prompt was verified against the code; file paths are exact.

## 0. Read these first, in this order

1. `AGENTS.md` (root) — repo-wide agent instructions. `CLAUDE.md` just points to it.
2. `.agents/features/GLOSSARY.md` — the domain vocabulary (block, flow, connection,
   platform, project, edition…). Then skim the specific `.agents/features/*.md` file
   for any feature you touch (there is one per subsystem: `blocks.md`, `flows.md`,
   `app-connections.md`, `oauth-apps.md`, `mcp.md`, `ee-platform.md`, etc.).
3. `.claude/rules/*.md` — four NON-NEGOTIABLE rules:
   - `data-isolation.md`: every DB query must filter by `projectId`/`platformId`.
   - `edition-safety.md`: CE code must never import from `src/app/ee/`.
   - `entity-registration.md`: new TypeORM entities must be added to `getEntities()`
     AND get a migration registered in `getMigrations()` — no auto-discovery.
   - `safe-http.md`: all outbound HTTP in server packages goes through `safeHttp`
     (SSRF protection). Never raw `fetch`/`axios.create` for user-influenced URLs.
4. `BLOCK_DISTRIBUTION_AND_AUTH.md` (root) — the decision document for how block
   code is distributed (GitHub Packages registry) and how OAuth works. Explains WHY.
5. `SETUP_GUIDE_FOR_ENGINEER.md` (root) — step-by-step operational setup (env files,
   OAuth app registration, publishing packages).
6. `packages/shared/CLAUDE.md`, `packages/blocks/CLAUDE.md`,
   `packages/server/engine/CLAUDE.md` — per-package conventions (model patterns,
   where to add enum entries, engine error-handling rules).

## 1. Monorepo layout (bun workspaces + turbo)

- `packages/shared` — `@intelblocks/shared`: types, zod DTOs, enums, utils. Version
  bump required on ANY change. Everything depends on it.
- `packages/blocks/framework` — `@intelblocks/blocks-framework`: the block SDK
  (`createBlock`, `Property.*`, auth types, `BlockMetadata`).
- `packages/blocks/common` — `@intelblocks/blocks-common`: shared block helpers
  (`httpClient`, auth utilities).
- `packages/blocks/{community,core,custom}` — ~744 integration packages, one folder
  per block (`@intelblocks/block-<name>`). `core/` holds utilities (webhook,
  schedule, store, forms, tables…), `community/` the app integrations.
- `packages/server/api` — the Fastify API (`src/app/…`). Boot: `src/bootstrap.ts`
  (loads **`.env.dev`**, NOT `.env`) → `src/app/app.ts` (edition switch registers
  modules per `IB_EDITION`: `ce` | `ee` | `cloud`).
- `packages/server/worker` — separate process that polls the API for jobs, installs
  block packages into sandboxes, and runs the engine.
- `packages/server/engine` — the execution engine, bundled by esbuild to
  `dist/packages/engine/main.js`; the worker spawns it. After editing engine source,
  rebuild (`npx turbo run build --filter=@intelblocks/engine`) AND restart the worker.
- `packages/web` — React/Vite frontend (port 4200, proxies `/api` to 3000).
- `packages/cli` — `blocks-cli` (create/build/publish block, sync, worker token).
- `scripts/` — operational scripts (see §5).

## 2. The core architecture: metadata vs code (most important concept)

Block **metadata** (display name, logo, actions/triggers/prop schemas) and block
**code** are fully decoupled:

- Metadata lives as rows in the `block_metadata` Postgres table. The picker UI is
  driven entirely by it. It is seeded by `packages/server/api/src/seed-blocks.ts`
  (standalone script — run `npm --prefix packages/server/api run seed-blocks` from
  repo root after building blocks). The API process NEVER imports block code.
- Code is fetched lazily at execution time by the worker:
  `packages/server/worker/src/lib/cache/pieces/piece-installer.ts` writes a
  package.json with the block as a dependency and runs `bun install`.
  - `packageType=REGISTRY` → installed by name@version from the npm-compatible
    registry (GitHub Packages, org `intelblocks`, configured in root `.npmrc` with
    `${GITHUB_TOKEN}` auth).
  - `packageType=ARCHIVE` → installed from an uploaded `.tgz` (org-private blocks).
  - Blocks listed in `IB_DEV_BLOCKS` (comma-separated names in `.env.dev`) bypass
    install entirely and load from their local `packages/blocks/**/<name>/dist`.
- The engine loads a block via `packages/server/engine/src/lib/helper/piece-loader.ts`
  using `pathToFileURL(...)` + a fixed `<pkg>/src/index.js` entry (NOT package.json
  `main`).

## 3. Verified gotchas — learn these or you will repeat our bugs

- **Env files:** the server reads **`.env.dev`** (see `bootstrap.ts`), not `.env`.
  `.env.dev` is intentionally NOT tracked by git (template: `.env.dev.example`).
  Never commit secrets; a `.gitignore` rule `.env*` (with `!.env.dev.example`) covers it.
- **Run the full stack with `npm run dev`** (web + api + engine + worker). The
  `serve:backend`/`serve:frontend`/`dev:backend` scripts DO NOT start the worker;
  without a worker, dropdown/options requests queue forever (UI spinner, 5-min
  safety timeout in `user-interaction-watcher.ts`).
- **Windows-specific fixes already in place** (don't regress them):
  - `piece-installer.ts` `relativeBlockPath` uses `path.posix.join` (bun `--filter`
    rejects backslashes).
  - `piece-loader.ts` uses `pathToFileURL(...)` for dynamic `import()`.
- **Publishing packages:** published-from-`dist/` tarballs need rewriting:
  `workspace:*` deps → real pinned versions AND `main`/`types`/`exports` stripped of
  the leading `./dist/` (the tarball root IS dist). `scripts/publish-packages.mjs`
  does all of this; NEVER hand-run `npm publish` on a package.
- **TypeORM `EntitySchema` column keys are loosely typed** — a mismatch between an
  entity column name and the TS model property compiles silently and explodes at
  Postgres parse time. Grep raw SQL strings when renaming fields.
- **Historical migrations under `src/app/database/migration/**` are FROZEN** — never
  edit them, even when they contain old names (`pieceType`, activepieces URLs).
  `RenamePiecesToBlocks.ts` intentionally references old column names.
- **`IbEdition` gates modules** in `app.ts`: `oauthAppModule` (platform OAuth2 apps)
  exists only in `cloud`/`ee`; `adminPlatformModule` (operator API `/v1/admin/*`,
  guarded by the `IB_API_KEY` header) only in `cloud`. Deployment target is
  `IB_EDITION=cloud`. Do not widen edition gates casually — `cloud` also exposes
  license/credit operator endpoints.
- **OAuth:** the frontend no longer contacts `secrets.activepieces.com`. Predefined
  OAuth2 apps come solely from platform-registered apps (`POST /v1/oauth-apps`,
  body `{blockName, clientId, clientSecret}`; UI at `/platform/setup/pieces`).
  `AppConnectionType.CLOUD_OAUTH2` still exists for backward compat but nothing can
  create one. Do not reintroduce the vendor dependency.
- **Feature gating in the UI** is driven by `platform.plan.*` booleans
  (`platform_plan` table) — locked icons mean a plan flag is false, and the AI &
  Agents tab additionally requires at least one row in `ai_provider`.
- **API route prefix is `/api/v1/...`** on port 3000 (e.g.
  `http://localhost:3000/api/v1/blocks`); the web dev server at 4200 proxies it.
- **jwt issuer is `intellisper`** (`packages/server/api/src/app/helper/jwt-utils.ts`);
  the CLI `generate-worker-token` matches. Any token with `iss: activepieces` is
  stale and will be rejected (symptom: worker polls fine but jobs hang).

## 4. Key files to read for deep understanding (in order)

Backend spine:
- `packages/server/api/src/app/app.ts` — module registration + edition switch.
- `packages/server/api/src/app/pieces/metadata/piece-metadata-service.ts` and
  `piece-metadata-entity.ts` — the block catalog (list = summaries; get = full).
- `packages/server/api/src/app/pieces/metadata/utils/piece-searching.ts` — Fuse.js
  search (block displayName is attached as `blockDisplayName` for nested matching).
- `packages/server/api/src/app/pieces/piece-sync-service.ts` — optional registry
  sync (`IB_BLOCKS_SYNC_MODE`, default NONE; guarded against prune-on-empty).
- `packages/server/api/src/app/workers/` — job broker, engine-response watcher,
  worker RPC. This is how API ↔ worker communicate (poll + socket).
- `packages/server/worker/src/lib/cache/pieces/piece-installer.ts` — block install.
- `packages/server/engine/src/lib/helper/piece-loader.ts` — block load/execute.

Frontend spine:
- `packages/web/src/app/routes/` — routers (`platform-routes.tsx` = admin console).
- `packages/web/src/features/pieces/` — picker hooks (`pieces-hooks.ts`:
  `useBlocksSearch` builds the Explore/Apps/Utility tab content), API clients,
  `utils/piece-search-utils.ts` (POPULAR/HIGHLIGHTED name lists — these are
  *preferences intersected with the catalog*, never assumptions of presence).
- `packages/web/src/app/builder/pieces-selector/` — the step-picker UI (tab gating
  in `index.tsx`, incl. AI tab conditions).
- `packages/web/src/features/connections/` — connection dialogs and OAuth2 flow.
- Branding: `packages/server/api/src/app/flags/theme.ts` (default theme; logo is
  self-hosted at `packages/web/public/intellisper-logo.png`).

## 5. Operational scripts (`scripts/`) — all dry-run by default

- `add-publish-config.mjs` / `verify-publish-config.mjs` — added
  `publishConfig.registry=https://npm.pkg.github.com` to all 748 packages; verifier
  re-checks field-by-field.
- `publish-packages.mjs` — THE publish pipeline: build → rewrite dist/package.json
  (workspace:\* → pinned versions; strip `dist/` from main/types/exports; force
  registry) → `npm publish` from `dist/`. Flags: `--write`, `--all`, `--only=a,b`,
  `--only-failed`, `--skip-published`. Report: `scripts/publish-packages.report.json`
  (gitignored). Foundation order: shared → blocks-common → blocks-framework → blocks.
- `delete-org-packages.mjs` — deletes `@intelblocks/*` packages from the GitHub org
  via API (Node fetch; needs `GITHUB_TOKEN` with `delete:packages`). Used to
  republish same versions after a bad publish (versions are immutable).

## 6. Commands & verification gates

- Full stack: `npm run dev` (root). API: `:3000`, web: `:4200`. Postgres+Redis run in
  Docker (`docker-compose.dev.yml`, containers `blockunits_postgres` on host port
  5433 / `blockunits_redis` on 6380).
- Typecheck: `npx tsc -p packages/web/tsconfig.app.json --noEmit` (expect 0),
  same for `tsconfig.spec.json` (0), worker tsconfig.lib (0). KNOWN pre-existing
  baselines: `packages/server/api` tsconfig.app = **28 errors**, engine tsconfig.lib
  = **8 errors** — none in recently-touched files. Compare counts, don't demand 0.
- API unit tests (Windows): from `packages/server/api`:
  `WINRUN_INCLUDE='test/unit/**/*.test.ts' npx vitest run --config vitest.winrun.mts`
  Baseline: **458 passed / 15 failed** — the 15 failures are pre-existing in 5 files
  (mcp-tool-validator, file-service-delete, job-broker, queue-dispatcher,
  machine-service). Treat any deviation from that exact baseline as a regression.
- Build one package: `npx turbo run build --filter=@intelblocks/<name>`.

## 7. Current state / recent history (as of the last session)

- Git history was intentionally squashed; the remote is `Kurvant/Intellisper` on
  GitHub; branch `firstWholeCommit` holds the pushed baseline. Do not push without
  being asked.
- All 748 `@intelblocks/*` packages carry `publishConfig` → GitHub Packages; a full
  publish was in progress; the `main`-path fix (§5) requires delete + republish of
  earlier-published packages (same versions — catalog references exact versions).
- Block catalog: 741 metadata rows seeded (REGISTRY/OFFICIAL). `IB_DEV_BLOCKS`
  currently lists the google* blocks + slack + store for local dev; it must be EMPTY
  in deployed environments.
- Admin/owner UI: `/platform/*` (billing at `/platform/setup/billing`, infra health
  at `/platform/infrastructure/*`, chat analytics at
  `/platform/observability/chat-analytics`); BullMQ dashboard at
  `http://localhost:3000/api/ui` (basic auth via `IB_QUEUE_UI_*`).
- A frontend redesign is being planned: read `docs/rewrite/frontend-redesign-plan.md`.

## 8. Working rules

- Verify before asserting: read the code, run the command, check the DB — never
  claim from memory. When you fix a bug, prove it end-to-end (the request that
  failed must now succeed) and, where feasible, mutation-test new regression tests.
- Match the surrounding code style; comments explain WHY, not what.
- Never touch `.env.dev` values without explicit permission (it holds live local
  credentials); never print tokens; never commit generated artifacts.
- Commit in small, well-explained commits. DO NOT push unless explicitly asked.
- The remaining brand leftovers are deliberate: frozen migrations, one engine test
  fixture, `buildActivepieceType` in the lever block, and `noreply@activepieces.com`
  default sender in `email-service.ts` (flagged, not yet changed). Don't "fix" them
  blindly — ask first.
