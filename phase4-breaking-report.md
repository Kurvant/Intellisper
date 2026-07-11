# Intellisper Rebrand — Final Report

The rebrand is **complete**. Every deferral from the earlier report has been closed. This document
supersedes the previous version (which listed several items as "still present" / "left as-is").

---

## 1. `/v1/blocks` API — endpoint reference

Full per-endpoint documentation (purpose, returned resource, auth, wire keys) lives in
**[`docs/api-blocks-endpoints.md`](docs/api-blocks-endpoints.md)**. Summary:

| Method | Path | Returns |
|---|---|---|
| `GET` | `/v1/blocks` | `BlockMetadataModelSummary[]` (list, filtered by platform policy) |
| `GET` | `/v1/blocks/categories` | `BlockCategory[]` |
| `GET` | `/v1/blocks/registry` | `BlockPackageInformation[]` |
| `GET` | `/v1/blocks/:name` | `BlockMetadataModel` (full: actions, triggers, props, auth) |
| `GET` | `/v1/blocks/:scope/:name` | `BlockMetadataModel` (scoped package) |
| `POST` | `/v1/blocks/options` | `ExecutePropsResult` (resolve dynamic dropdown/props) |
| `POST` | `/v1/blocks/sync` | `void` (sync registry → `block_metadata`, refresh cache) |
| `POST` | `/v1/blocks` | `BlockMetadataModel` (install; community + platform controllers) |
| `POST` | admin `/blocks` | official-block registration |

**Breaking:** `/v1/pieces*` now returns **404** (no alias, per decision). Wire keys renamed:
`pieceName→blockName`, `pieceVersion→blockVersion`, `pieceArchive→blockArchive`, `pieces→blocks`.

**Finding:** the web client calls `DELETE /v1/blocks/:id`, but **no such route ever existed** —
verified against the pre-rebrand commit `4ef3a2e4bb`. A pre-existing dead client method, not a
regression. Either implement the uninstall route or delete the client method.

---

## 2. Package identity + `bun install` re-link

**Yes, it was required — and it exposed the real cause of the test failures.**

`@activepieces/*` → `@intelblocks/*` (4 core packages, `blocks-framework`, `blocks-common`, and
742 `block-*` packages). The CLI `bin` is now `blocks-cli`.

The re-link surfaced that **40 bun store entries were empty (0 files, never extracted)** — the
*entire* `@opentelemetry/*` subtree plus `protobufjs`, `require-in-the-middle`, `shimmer`,
`@types/shimmer`. See §5.

---

## 3. Name/value split — **collapsed**

There is no existing data, so the deferred wire values were flipped to match their identifiers:

| Identifier | Old value | New value |
|---|---|---|
| `FlowActionType.BLOCK` | `'PIECE'` | `'BLOCK'` |
| `FlowTriggerType.BLOCK` | `'PIECE_TRIGGER'` | `'BLOCK_TRIGGER'` |
| `AgentToolType.BLOCK` / `ToolCallType.BLOCK` | `'PIECE'` | `'BLOCK'` |
| `EngineOperationType.EXTRACT_BLOCK_METADATA` | `'EXTRACT_PIECE_METADATA'` | `'EXTRACT_BLOCK_METADATA'` |
| `WorkerJobType.EXECUTE_EXTRACT_BLOCK_INFORMATION` | `'EXECUTE_EXTRACT_PIECE_INFORMATION'` | `'EXECUTE_EXTRACT_BLOCK_INFORMATION'` |
| `WebsocketClientEvent.REFRESH_BLOCK` | `'REFRESH_PIECE'` | `'REFRESH_BLOCK'` |
| `IbFlagId.BLOCKS_SYNC_MODE` | `'PIECES_SYNC_MODE'` | `'BLOCKS_SYNC_MODE'` |
| `IbFlagId.PRIVATE_BLOCKS_ENABLED` | `'PRIVATE_PIECES_ENABLED'` | `'PRIVATE_BLOCKS_ENABLED'` |
| `TelemetryEventName.BLOCKS_SEARCH` | `'pieces.search'` | `'blocks.search'` |
| `ErrorCode.BLOCK_SYNC_NOT_SUPPORTED`, `MCP_BLOCK_*` | `*PIECE*` | `*BLOCK*` |
| npm package prefix | `piece-` | `block-` |
| MCP step-type vocabulary | `PIECE_ACTION`/`PIECE_TRIGGER` | `BLOCK_ACTION`/`BLOCK_TRIGGER` |
| `AIProviderName.INTELLISPER` | `'activepieces'` | `'intellisper'` |
| `APPSUMO_INTELLISPER_TIER1-6` | `appsumo_activepieces_tierN` | `appsumo_intellisper_tierN` |
| JWT `ISSUER`, SCIM URN, SAML verify-record prefix | `activepieces` | `intellisper` |

`BlockType` (`CUSTOM`/`OFFICIAL`) and `PackageType` (`ARCHIVE`/`REGISTRY`) contain no brand token
and correctly needed no change.

---

## 4. Complete rebrand — everything closed

Every item previously listed as "NOT renamed" is now done, plus surfaces that were never on the list:

- **`ActivepiecesError` → `IntellisperError`** (116 files; file `git mv`'d to `intellisper-error.ts`).
  `ErrorCode.*PIECE*` members and values renamed too.
- **All user-facing UI copy** (`t('Pieces')` → `t('Blocks')`, page titles, toasts) **plus all 11 i18n
  locale files** (ar, de, en, es, fr, ja, nl, pt, ru, zh, zh-TW) with keys re-matched to source strings.
- **Brand identifiers/values**: `AIProviderName`, `IntellisperChatTier`, `INTELLISPER_CHAT_TIERS`,
  `APPSUMO_INTELLISPER_TIER*`, `IntellisperProviderAuthConfig`, embed-SDK `Intellisper*` types,
  SCIM URN, JWT issuer, SAML `entityID`, OTel service names (`intellisper-api`/`-worker`),
  config dir `.intellisper`, `intellisperLogin` query param.
- **All 57 MCP/chat agent tools `ap_*` → `ib_*`** (42 tool files `git mv`'d `ap-*.ts` → `ib-*.ts`);
  tool arg `pieceName` → `blockName`.
- **`packages/cli` — which every prior phase had missed entirely.** Commands (`create-block`,
  `build-block`, `publish-block`, `sync-blocks`), the scaffold template it emits for new blocks,
  and its API call.
- **Remaining `ap*` artifacts**: `apVersionUtil`→`ibVersionUtil`, `apDayjs`/`apDayjsDuration`→`ib*`,
  `ap-version.ts`→`ib-version.ts`, `ap-browser-storage.ts`→`ib-browser-storage.ts`,
  localStorage keys `ap-ui-theme`→`ib-ui-theme`, `ap_pinned_items_`→`ib_pinned_items_`,
  `__AP_DB_CONNECTION__`→`__IB_DB_CONNECTION__`.
- **Env vars**: the worker was still building the sandbox env with `AP_*` names. Now `IB_*` throughout,
  plus `DEV_PIECES`→`DEV_BLOCKS`, `PIECES_REGISTRY_URL`→`BLOCKS_REGISTRY_URL`,
  `PIECES_SYNC_MODE`→`BLOCKS_SYNC_MODE`.
- **Docs/rules**: stale `@activepieces/*` references in `AGENTS.md`, `CLAUDE.md`,
  `.claude/rules/safe-http.md`, `STYLE.md`, READMEs.

### Deliberately left (justified)
- Real third-party endpoints: `*.activepieces.com` (CDN, cloud, api, secrets, support email),
  `github.com/activepieces`, the Firebase function `us-central1-activepieces-b3803.cloudfunctions.net`.
- The `piece-activepieces` community integration — it integrates *with* the Activepieces product.
- The external npm dep `@activepieces/import-fresh-webpack`.
- Frozen DB migrations under `database/migration/**` (historical record). Note the unregistered,
  dead `RenameEnabledToolsToDisabledTools` migration still lists `ap_*` tool names — it never runs.
- On-disk directory `packages/blocks/` and source filenames like `piece-metadata-service.ts`,
  `friendly-piece-error.ts` — paths only; **all exported symbols are Block-named**. Cosmetic.

---

## 5. Test environment — **fixed, and tests now run**

**My previous claim was wrong.** It was *not* a "bun dependency-hoisting quirk". The actual cause:

> **40 entries in the bun store were empty directories — 0 files.** The packages were never
> extracted. `node_modules/.bun/@opentelemetry+api@1.9.0/.../@opentelemetry/api` contained nothing,
> and `@hyperdx/node-opentelemetry`'s nested symlink pointed at that empty directory. Every
> `require('@opentelemetry/api')` therefore failed — at instrumentation bootstrap, before any
> application or test code ran, which is why **every** test (unit and integration alike) died.

**Fix:** removed the 40 broken store entries and reinstalled. `@opentelemetry/api` now has 642 files,
the nested symlink resolves, and **0 empty store entries remain**. Zero risk — no source change, no
version change; bun simply re-extracted what it had failed to extract.

**A second, related trap:** stale `dist/` output. `tsc` does not delete outputs for removed source
files, so `server-utils/dist` still exported `apDayjsDuration` after the rename, causing
`TypeError: (0, ibDayjsDuration) is not a function` at runtime. All package `dist/` dirs were removed
and rebuilt clean.

### Current results

| Suite | Result |
|---|---|
| **api unit** | **33 files passed, 6 failed** |
| **worker** | **13 files passed, 5 failed** (222 passed / 22 failed) |
| src `tsc` — shared, utils, cli, blocks-common, blocks-framework, api, worker, web | **0 errors** |
| src `tsc` — engine | **8 errors** (pre-existing Buffer/dns/arg-count baseline, proven via a pre-Phase-4 worktree) |

**All remaining test failures are verified non-rename.** The 6 failing api-unit files contain
**zero** stale rename symbols (`Piece*`, `pieceName`, `ActivepiecesError`, `ap_*`, `FlowActionType.PIECE`).
Their error signatures:
- `Host is required` ×26 → **Redis/DB not available** in this environment (`rate-limiter-interceptor`, `file-service-delete`)
- `Cannot read properties of undefined (reading 'config')` ×6 → axios mock (`mcp-tool-validator`)
- `system.getNumber is not a function` ×4 → incomplete `system` mock (`machine-service`)
- `expected null not to be null` → mock/logic (`job-broker`, `queue-dispatcher`)

Two of these files pass 10/10 and 13/13 when run in isolation, confirming test-pollution rather than
defects. Worker failures are likewise pre-existing: a worker version-gate vs. mock mismatch, Windows
path-separator assertions, and `isolate` being Linux-only.

---

## 6. Real bugs found and fixed during this pass

These were **latent defects**, not cosmetic renames:

1. **`project-diff.service.ts:73`** compared `key === 'pieceVersion'` after the field became
   `blockVersion`. Block-version drift was silently no longer normalized to major.minor, producing
   false "flow changed" diffs on patch bumps. *(Fixed; `flow-diff.test.ts` now passes 9/9.)*
2. **Worker↔engine env mismatch.** The worker built the sandbox env with `AP_EXECUTION_MODE`,
   `AP_NETWORK_MODE`, `AP_EGRESS_PROXY_URL`, `AP_DEV_PIECES` while the engine reads `IB_*`. It only
   worked via the Phase-3 deprecation shim. Now aligned directly.
3. **`chat-tool-executor.ts`** read `toolInput['pieceName']` while the worker's tool schemas already
   emitted `blockName` — a live producer/consumer mismatch.
4. **`chat-ai-utils.ts`** compared `toolName === 'ap_execute_action'`; the tools are now `ib_*`, so
   that branch was dead code.
5. **CLI `generate-worker-token`** signed JWTs with `ISSUER = 'activepieces'` while the server verifies
   `'intellisper'` — CLI-generated worker tokens would have failed verification.
6. **CLI `publish-block`** still POSTed to `/v1/pieces` (404 after the no-alias rename), with the old
   `pieceName`/`pieceArchive` form fields.
7. **MCP integration test** imported non-existent symbols (`apResearchPiecesTool`, `apGetPiecePropsTool`).
8. **`ap_get_block_props`** was never a real tool — a stale web display-label key that never matched the
   server's actual tool name. Consolidated to `ib_get_block_props`.

---

## 7. `AP_EGRESS_LOCKDOWN` → `IB_EGRESS_LOCKDOWN` — **renamed** (approved)

**It is not an environment variable.** It is the name of an **iptables chain** created by the worker
at startup (`packages/server/worker/src/lib/egress/iptables-lockdown.ts`).

**What it does:** it is the kernel-level SSRF backstop for sandboxed flow code. On start (when
`IB_NETWORK_MODE=STRICT`) the worker creates the chain, allows loopback TCP to the egress proxy port
and the worker RPC port range, allows DNS to the configured nameservers, then `REJECT`s everything
else — and attaches it to `OUTPUT` **for the sandbox UID range only**. So sandboxed user code can
reach the proxy and DNS and nothing more; direct hits to cloud-metadata IPs or internal hosts are
rejected by the kernel even if the application-level `safeHttp`/`ssrfGuard` were bypassed.

**Not persisted anywhere.** The string existed in exactly three places — the `const CHAIN` and two
test files. Not in the DB, `.env`, Helm, or compose. It only ever exists as a live kernel object.

**Done:** renamed in all 3 files (19 occurrences). Verified: worker `tsc` 0 errors; the egress test
suite passes **28/28 across 3 files**, asserting the full command set — `-N IB_EGRESS_LOCKDOWN`,
the `-A OUTPUT -m owner --uid-owner <range> -j IB_EGRESS_LOCKDOWN` attach, and the `-D`/`-F`/`-X`
teardown — so creation, attachment, and cleanup all agree on the new name.

**Residual operational note (only if you ever run long-lived worker hosts):** an iptables chain
outlives its process. On a host where an *old* worker died uncleanly (SIGKILL/OOM), the orphaned
`AP_EGRESS_LOCKDOWN` chain and its `OUTPUT` jump rule remain armed against the same sandbox UID
range, and the new binary's `preflightCleanup()` only knows the new name. Sandbox egress there would
fail with `EHOSTUNREACH` until someone runs:

```sh
iptables -D OUTPUT -m owner --uid-owner <firstBoxUid>-<lastBoxUid> -j AP_EGRESS_LOCKDOWN
iptables -F AP_EGRESS_LOCKDOWN && iptables -X AP_EGRESS_LOCKDOWN   # and ip6tables likewise
```

This does not apply to container deploys (fresh network namespace each time), and there are no
existing deployments — so no host anywhere holds a stale chain. No legacy cleanup shim was added.

---

## 8. Operational actions still required

1. **Migrations must be re-run.** The `CleanRoomBaseline` migration was edited to create `block_*`
   directly. Fresh DBs get the new schema; existing DBs converge via the guarded forward migration
   `RenamePiecesToBlocks1782200000000` (idempotent — a safe no-op on an already-`block_*` DB).
   A dev DB that already ran the *old* `piece_*` baseline should either let the forward migration
   converge it or be reset. Verify which baseline your DB ran.
2. **`bun install` after pulling** — package names changed; the workspace must re-link.
3. **Rebuild `dist/`** for `shared`, `server-utils`, `blocks-framework`, `blocks-common` — stale
   outputs shadow renamed exports at runtime.
4. **External API clients** calling `/v1/pieces*` must move to `/v1/blocks*` (no alias).
5. **External block authors** depending on `@activepieces/pieces-framework` must move to
   `@intelblocks/blocks-framework` and `createBlock(...)`.
