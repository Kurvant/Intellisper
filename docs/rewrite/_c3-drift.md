# C3 — documentation drift findings (verified vs code)

## ✅ C3 STATUS — DONE (2026-07-20), build GREEN. All safe corrections applied in port-content.cjs §3g.
Applied + verified (10/10): embed JWT nested-blocks+role-case+5 phantom claims removed; createPiece→
createBlock; dev@ap.com→dev@intellisper.local; fork URLs→Kurvant/Intellisper; Nx→Turbo; PIECE_FOLDER_NAME→
BLOCK_FOLDER_NAME; mcp subpath /activepieces→/intellisper; sdk-changelog "Acitvepieces"→Intellisper;
6 env-var wrong defaults corrected; 4 phantom env rows removed (MAX_MCPS kept — real flag); Operator role
column removed + "four"→"three"; SCIM Entra card added; docker-hub→ghcr wording.
FLAGGED for owner (untouched): IB_MAX_MCPS_PER_PROJECT default, Git-sync/Editor permission cell,
platform-admin nav breadcrumbs, pieceAuthType SDK key, 3rd-party activepieces slugs, activePiecesUrl,
Conjur IDs, cosmetic *piece*.png image filenames (→ C5).

---


Agents verify doc claims against code; I apply fixes durably in `port-content.cjs` (the docs-site copy is
regenerated, so source-of-fix is the port script or the legacy `docs/` source). Security constraint:
no secrets, no security-control internals — user/admin-facing facts only.

## Studio flows (self-verified, DONE)
- `mcp/tools.mdx` — already BLOCK-correct (BLOCK_ACTION/BLOCK_TRIGGER/CODE/LOOP_ON_ITEMS/ROUTER). ✅
- `flows/debugging-runs.mdx` — nav fixed: "Dashboard → Runs" → "Operate → Runs" (domain-nav.ts:85-86). ✅ (in port-content §3e-e)
- `FlowActionType = CODE|BLOCK|LOOP_ON_ITEMS|ROUTER` (BLOCK not PIECE); `FlowRunStatus` = 11 states. Confirmed vs code. (CLAUDE.md's "PIECE"/"12 states" is stale — a repo doc issue, not ours.)
- `flows/known-limits.mdx` — ALL env-var defaults verified correct (600/30/25/50/25/512/5/1048576/30). ✅
- Embedding `piecesFilterType`→`blocksFilterType` — already fixed in shipped docs (customize-blocks, provision-users). ✅

## Deploy / Install (agent-verified)

### 🔴 Wrong default values (install/configuration/environment-variables.mdx) — MUST fix
| Line | Var | Doc says | Code default | Source |
|---|---|---|---|---|
| 16 | `IB_CLOUD_AUTH_ENABLED` | false | **true** | system.ts:28 |
| 24 | `IB_QUEUE_UI_ENABLED` | true | **false** | bullboard.ts:17 (`?? false`) |
| 28 | `IB_REDIS_FAILED_JOB_RETENTION_MAX_COUNT` | 2000 | **100000** | system.ts:57 |
| 43 | `IB_POSTGRES_IDLE_TIMEOUT_MS` | 30000 | **300000** | system.ts:67 |
| 65 | `IB_PROJECT_RATE_LIMITER_ENABLED` | true | **false** | system.ts:62 |
| 94 | `IB_ISSUE_ARCHIVE_DAYS` | 14 | **7** | system.ts:66 |

### 🔴 Phantom env vars — REMOVE (verified absent as configurable props)
| Line | Var | Note (self-verified) |
|---|---|---|
| 31 | `IB_BLOCKS_CACHE_MAX_ENTRIES` | value 1000 is a HARDCODED const in embed-security.ts, NOT an env var — not configurable. Remove. |
| 32 | `IB_BLOCKS_SOURCE` | phantom; real is `IB_BLOCKS_SYNC_MODE` (system-props:71). Remove (SYNC_MODE already documented). |
| 65 | `IB_TRIGGER_FAILURE_THRESHOLD` | genuine phantom, self-contradictory desc. Remove. |
| 92 | `IB_MAX_TABLES_PER_PROJECT` | genuine phantom — not a prop, not a flag anywhere. Remove. |

### ⚠️ CORRECTION to agent — do NOT remove IB_MAX_MCPS_PER_PROJECT
The Deploy agent said `IB_MAX_MCPS_PER_PROJECT` is phantom. **It is NOT** — it's a real `ApFlagId`
(`flag.ts:58`), a genuine per-project MCP limit. Removing it would delete a real limit. But it's not read
via `system.get` in the API, so whether the `IB_`-env framing / default is accurate is unclear. Per the
"borderline → skip + list" rule: **LEAVE the row as-is, FLAG for owner** — confirm whether this limit is
env-settable and its real default before changing it. (Spot-check caught this — the agent's grep was
scoped to system-props only.)

### 🟠 Brand leakage — activepieces URLs (install docs)
| File:line | Leak | Fix |
|---|---|---|
| overview.mdx:77 | pikapods `?run=activepieces` | Intellisper pod slug or remove |
| options/aws.mdx:13 | `hub.docker.com/r/activepieces/activepieces` | ghcr.io/kurvant/intellisper |
| options/aws.mdx:88,95 | `activePiecesUrl` config key | Pulumi output key (see OWNER INPUT — Pulumi) |
| options/easypanel.mdx:8 | `templates/activepieces` | Intellisper template slug |
| options/railway.mdx:16 | `hub.docker.com/r/activepieces/activepieces` | ghcr.io/kurvant/intellisper |
| options/elestio.mdx:8 | `elest.io/open-source/activepieces` | Intellisper listing |
| options/docker.mdx:63 | "Docker Hub" (but pulls from ghcr.io) | "GitHub Container Registry (ghcr.io)" |

Note: aws.mdx `activePiecesUrl` + the 3rd-party template/listing slugs (pikapods/easypanel/elestio) need
OWNER INPUT (external listing URLs we may not control) — flag, don't guess. Docker-image + docker-hub→ghcr
fixes are safe to apply.

### Sensitive surface (noted only, per constraint)
environment-variables.mdx:97-99 (`IB_NETWORK_MODE`, `IB_SSRF_ALLOW_LIST`, `HTTP(S)_PROXY`) — SSRF/egress
control. Names/defaults confirmed accurate; internals NOT reproduced. Leave as-is.

## Admin Guide (agent-verified + self-confirmed)

### 🔴 "Operator" role is INVENTED (permissions.mdx) — self-confirmed
- `permissions.mdx:15` says "**four** standard roles"; `:17` table has an **Operator** column.
- Code: `DefaultProjectRole` = **Admin, Editor, Viewer** only (3). Operator is stale Activepieces content
  this fork dropped.
- **Fix:** "four" → "three"; remove the entire **Operator** column from the table.

### 🟡 Git Sync permission nuance (permissions.mdx:32-35)
- Table shows Git Sync (Configure/Pull/Push) as **Admin only**; Editor blank.
- Code: Editor holds `WRITE_PROJECT_RELEASE` + `READ_PROJECT_RELEASE` (access-control-list.ts:42-43) —
  releases are gated on `WRITE_PROJECT_RELEASE`. So Editor CAN create releases.
- **Fix (needs care):** distinguish "create a release" (Editor-allowed) from "configure the Git repo"
  (confirm exact permission). Verify the git-repo-config permission before editing — don't guess which
  cell to flip. FLAG for careful edit.

### 🟡 SCIM overview lists only Okta (scim/overview.mdx:30-34)
- Overview `<CardGroup>` lists only Okta, but `scim/providers/microsoft-entra-id.mdx` exists.
- **Fix:** add a Microsoft Entra ID card to match the shipped provider page. (Safe, docs-internal.)

### Verified ACCURATE (no drift): SCIM_DEFAULT_PROJECT_ROLE (default Editor), audit event names
(ApplicationEventName), Event Streaming = EE, "Write Project Release" → WRITE_PROJECT_RELEASE.

### ⚠️ Nav breadcrumbs (NOT verifiable — flag, don't touch)
"Platform Admin → Security → …" breadcrumbs (permissions:43, audit overview:19, event-streaming:21)
couldn't be confirmed: the overhaul nav uses domain groups (Build/Operate/Data/Connect/Insights/Admin),
not a "Platform Admin → Security" tree. These MAY be stale but there's no positive evidence of the new
path. FLAG for human check of the platform-admin sub-nav routing; do NOT reword on a guess.

### Sensitive surfaces (per constraint, not verified/detailed)
`admin-guide/guides/secret-managers/**`, `admin-guide/security/practices.mdx` — secret-store/security
controls. Not reproduced.

## Embedding (agent-verified + self-confirmed) — 🔴🔴 HIGHEST PRIORITY: broken embed docs break integrations

**Verified embed-token payload shape (external-token-extractor.ts:27-36):**
`{ externalUserId, externalProjectId, firstName, lastName, role, blocks?: {filterType, tags},
concurrencyPoolKey?, concurrencyPoolLimit? }`. Everything else the docs claim is NOT read.

Files: `embedding/provision-users.mdx`, `embedding/customize-blocks.mdx`.

1. **`blocksFilterType` documented FLAT — code reads it NESTED** under `blocks: { filterType, tags }`.
   (provision-users:56,72,102; customize-blocks:27). Fix: `"blocks": { "filterType": "ALLOWED",
   "tags": ["free"] }`. NOT a top-level `blocksFilterType` claim.
2. **`piecesTags` claim doesn't exist** (residual brand + wrong shape) — tags are `blocks.tags`
   (provision-users:73; customize-blocks:29). Remove `piecesTags`.
3. **`role` wrong-case** — docs `EDITOR`/`VIEWER`/`ADMIN`; code looks up by exact NAME `Admin`/`Editor`/
   `Viewer` (uppercase → not-found error). Fix example to `"role": "Editor"`.
4. **`version`, `tasks`, `aiCredits`, `projectDisplayName`** — documented claims the server does NOT read
   (provision-users:50,57-59,67,97; table rows :74-75). Remove from examples/tables (workspace display
   name derives from `externalProjectId`).
5. **`sdk-changelog.mdx:13`** — typo'd brand "Acitvepieces" → "Intellisper".

Verified ACCURATE: `IB_ALLOWED_EMBED_ORIGINS` (configure-embedding:44), `concurrencyPoolKey/Limit`,
`blocksFilterType` enum values NONE/ALLOWED (only the shape/placement is wrong, not the values).

Note: the PUBLIC embed SDK method names (intellisper.configure/connect/…) are a separate npm deliverable
NOT in this repo — can't verify against code. Leave SDK-method docs as-is (no evidence either way).

## Build Blocks (agent-verified + self-confirmed) — 🔴 createPiece breaks compiles

**Reference facts (code):** framework exports **`createBlock`** only (piece.ts:76, NO `createPiece`);
`BlockAuth`/`Property.*`/`createAction`/`createTrigger` correct; npm scope `@intelblocks`; dev login
**`dev@intellisper.local`** / `12345678`; build tool **Turbo** (no nx.json).

### 🔴 `createPiece` in code samples → `createBlock` (snippets won't compile)
- block-definition.mdx:40 (import) · block-authentication.mdx:16 · create-action.mdx:79 ·
  create-trigger.mdx:110 · block-reference/authentication.mdx:7,12 (prose).
  All import/name `createPiece` but bodies call `createBlock`. Fix import + prose → `createBlock`.

### 🔴 Wrong dev login email `dev@ap.com` → `dev@intellisper.local`
- development-setup.mdx:37-38 · misc/codespaces.mdx:29-30 · misc/dev-container.mdx:39. (Password OK.)

### 🟠 Wrong fork Git URLs `activepieces/activepieces` → `Kurvant/Intellisper`
- setup-fork.mdx:20 (`.../YOUR_USERNAME/Intellisper.git`) · private-fork.mdx:22,59,68.

### 🟠 Stale build tool "Nx" → "Turbo"
- block-reference/external-libraries.mdx:6. (Nx refs INSIDE migrate-nx-to-turbo.mdx are historical — leave.)

### 🟡 Placeholder `PIECE_FOLDER_NAME`/`<your_piece>` → `BLOCK_FOLDER_NAME`/`<your_block>`
- sharing-blocks/community.mdx:23,27 · block-reference/i18n.mdx:10,14. (Commands work; wording only.)

### 🟠 Subpath-deploy example path leak
- mcp/overview.mdx:67 `https://your-instance.com/activepieces` → neutral prefix (e.g. `/intellisper`).

### 🟠 Predefined-connection embed field `pieceAuthType`
- embedding/predefined-connection.mdx:37,54,123,131,147,149 — `pieceAuthType`. This is the PUBLIC embed
  SDK API (not in repo) — CONFIRM current SDK key (`blockAuthType`?) before changing. FLAG, don't guess.

## 🟢 Rebrand sweep RESULT: CLEAN
`piecesFilterType`, `PieceAuth`, `cloud.activepieces.com`, `@activepieces` = **ZERO** matches in docs.
No real secrets (only obvious placeholders). Residue is only the items above + cosmetic image filenames.

### 🖼️ Cosmetic: image filenames still `*piece*` (render fine; low priority — C5 image pass)
tag-pieces.png, connections-piece*.png, install-piece.png, manage-pieces*.png, i18n-pieces.png.

### 📋 Legitimately-external "activepieces" (CONFIRM w/ owner — 3rd-party slugs, may be correct as-is)
crowdin.com/project/activepieces (i18n.mdx) · pikapods `?run=activepieces` · docker hub
`activepieces/activepieces` · elest.io/…/activepieces · easypanel …/activepieces ·
cyberark-conjur.mdx Conjur policy IDs `activepieces/activepieces` (already in OWNER INPUT list) ·
aws.mdx `activePiecesUrl` config key (already in OWNER INPUT — Pulumi).

---

## APPLY PLAN
- **Safe, code-verified corrections** (apply in `port-content.cjs` per-file transforms, durable across
  re-port): env-var defaults (6), phantom rows (4: cache/source/trigger-threshold/max-tables), embed-JWT
  shape+role+phantom-claims, Operator-role removal, createPiece→createBlock, dev-email, fork URLs,
  Nx→Turbo, placeholder wording, mcp subpath, sdk-changelog typo, SCIM Entra card, docker-hub→ghcr text.
- **FLAG for owner (don't touch):** IB_MAX_MCPS_PER_PROJECT (real flag), Git-sync/Editor permission cell,
  platform-admin nav breadcrumbs, pieceAuthType SDK key, 3rd-party activepieces slugs, activePiecesUrl,
  Conjur IDs, image-filename rename (→ C5).
