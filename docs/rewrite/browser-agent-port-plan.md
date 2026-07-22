# Browser-Agent Port — Full Implementation Plan

> **Status: PLAN — implementation has NOT started.**
> Progress ledger: [browser-agent-port-progress.md](./browser-agent-port-progress.md) — MUST be
> updated at the close of every phase (and mid-phase for anything surprising).
> Prerequisite reading: `c:\projects\apprendai\INTELLISPER_BROWSER_AUTOMATION_REPORT.md`
> (complete architecture of the system being ported) and the locked decision set below.
>
> **Goal:** re-implement the Intellisper browser agent's server (currently NestJS in
> `apprendai/server` / `apprendai/intellisper-server`) **natively inside this blockunits
> Fastify codebase**, so the Chrome extension and the blockunits frontend call ONE backend —
> without breaking, leaking, or degrading anything on either side.

---

## 0. Locked decisions (user-confirmed 2026-07-12 — do not re-litigate)

| # | Decision |
|---|---|
| D1 | **Green-field.** No existing browser-agent users → no data migration, no compat proxy. Port completes before launch marketing. |
| D2 | **Tenancy:** solo signup → auto-provisioned personal platform + project (blockunits sign-up already does exactly this — reuse, don't rebuild). **One platform per email.** Invite collision (email already owns a personal platform) → **transfer/abandon-personal-platform flow**. |
| D3 | **Privacy:** agent rows scoped `platformId + userId`. Platform sharing switch only **unlocks** sharing; each user must individually **opt in**; no retroactive exposure from an admin action alone. **`memory_fact` is ALWAYS private** regardless of both switches — sharing governs routines, conversations, and run/batch outputs only. Enforcement = mandatory deny-by-default scope helper + **Postgres RLS backstop** + same predicate on admin surfaces/exports/notifications. |
| D4 | **Memory:** ONE service, ported from the proven browser-agent design, with scope discriminator `USER` (always private) vs `PROJECT/PLATFORM` (future flows/copilot/MCP). **Degrades gracefully when pgvector is absent.** Browser agent wired first; flow agent steps only after proven. |
| D5 | **Naming:** agent workflows → **"Routine"** (entities, routes, UI copy). Never "workflow" — that word belongs to blockunits Flows territory. |
| D6 | **Billing:** port the browser agent's billing (Paystack/Airwallex/PayPal + monthly usage counters) **alongside** blockunits billing, clearly marked as browser-side, with TODO comments describing future integration. Rule: every feature has exactly ONE entitlement authority — agent features → ported counters; platform features → `platform_plan`. Caps **pooled per platform**. |
| D7 | **Loop placement:** the agent engine is **worker-ready from day one** (pure checkpoint-in / events-out, zero HTTP coupling) but **hosted in the API process at launch**. Lifting to workers later is a deployment change, not a rewrite. |
| D8 | **Protocol versioning:** extension sends a protocol version on connect; server speaks it or replies "update required"; SSE event changes are **additive-only** from release one. |

**Global invariants (every phase, every PR):**
- Everything is **additive**. No existing blockunits file changes behavior unless a phase
  explicitly lists it under "Shared-resource touchpoints" with its regression tests.
- All new server code follows the four non-negotiable rules: data isolation, edition safety,
  entity registration, `safeHttp`.
- The kill switch `IB_BROWSER_AGENT_ENABLED` (env, default **false**) gates registration of
  every agent module until final cutover. With it off, blockunits must be byte-for-byte
  behaviorally identical to today.
- Baselines that must never regress (recorded in Phase 0, re-checked at every gate):
  web `tsc` = 0 errors; api `tsc` baseline = 28; engine = 8; API vitest = 458 passed / 15
  known-failed (exact same 15); `npm run lint-dev` clean on touched files.
- The NestJS servers (`apprendai/server`, `apprendai/intellisper-server`) are **read-only
  references** during this port. Nothing there is modified.

---

## 1. Where the code lives (module layout)

The agent needs email, billing-provider plumbing, and platform-plan awareness — all EE/cloud
territory. Per the edition-safety rule (CE never imports `src/app/ee/`), **all agent modules
live under the EE layer** and register in the edition switch for **CLOUD and ENTERPRISE**:

```
packages/server/api/src/app/ee/browser-agent/
├── browser-agent.module.ts          # registers all sub-modules; gated by IB_BROWSER_AGENT_ENABLED
├── engine/                          # THE ported loop (pure: checkpoint in → AgentEvent[] out)
│   ├── agent-engine.ts              # drive/handleToolCall/checkpoint IO — NO fastify imports (D7)
│   ├── agent-events.ts              # AgentEvent union + PROTOCOL_VERSION (D8)
│   ├── checkpoint.ts                # RunCheckpoint / ReplayCheckpoint types + (de)serialization
│   └── replay-engine.ts             # deterministic routine replay (condition/extract/self-heal)
├── model-provider/                  # Vercel AI SDK facade (tiers, caching, billedTokens)
├── tools/                           # tool registry + 7 tool families
├── memory/                          # unified memory service (D4) + controller
├── routines/                        # Routine record/param-infer/replay-plan + controller (D5)
├── automation/                      # batches, schedules, presence, work-claim, notifier
├── files/                           # agent file service (S3) + controller
├── grammar/                         # grammar service (quickTools-metered)
├── research/                        # web-fetch (via safeHttp) + compileReport support
├── billing/                         # ported browser-side billing (D6) — marked, with TODOs
├── security/
│   ├── agent-scope.ts               # THE mandatory scope helper (deny-by-default)
│   └── rls.ts                       # per-transaction GUC setter + policy helpers
└── sharing/                         # platform switch + per-user opt-in settings
```

Shared code additions (small, additive):
- `packages/shared/src/lib/` — new `browser-agent/` types barrel (AgentEvent, DTOs, enums) with
  a **minor version bump** of `@intelblocks/shared`.
- `packages/server/api/src/app/helper/sse.ts` — a small SSE reply helper (new; used only by
  agent routes at first).

**Registration** (`app.ts` edition switch): `case IbEdition.CLOUD:` and `case ENTERPRISE:` add
`if (system.getBoolean('BROWSER_AGENT_ENABLED')) await app.register(browserAgentModule)`.
CE never registers it (and never imports it).

---

## 2. Identity, account & access scoping (spelled out)

### 2.1 Principals and auth
- The extension and web client authenticate with **blockunits' existing authentication**
  (email/password sign-up & sign-in, federated Google, issuer `intellisper`). No parallel auth
  stack is ported. **Token model changes for the extension:** blockunits issues one 7-day JWT
  with `tokenVersion` invalidation — there is no 15m/7d refresh pair. The extension's
  token-store simplifies to a single token; a 401 → warm re-login screen (already built).
- Agent routes accept `PrincipalType.USER` only (plus `SERVICE` where explicitly noted).
  Engine/worker principals are NOT accepted on agent routes.
- Sign-up already auto-provisions platform + personal project (verified:
  `.agents/features/authentication.md` — "on first sign-up (no platformId), a new platform and
  personal project are created automatically"). D2's personal platform = this existing flow,
  untouched.

### 2.2 The scoping matrix (normative — tests enforce every row)

| Table | Scope columns | Read predicate (default) | Read predicate (sharing ON: platform switch AND owner opted in) | Write |
|---|---|---|---|---|
| agent_conversation | platformId, userId | `userId = me AND platformId = mine` | + platform members may read | owner only |
| agent_message | via conversation | inherits conversation | inherits | owner only |
| agent_run / agent_action | platformId, userId | owner only | + platform members (read-only) | owner only |
| memory_fact / memory_entity / memory_relation | platformId, userId | **owner only — ALWAYS (D3)** | **never shared, no exceptions** | owner only |
| routine / routine_step | platformId, userId | owner only | + platform members may read & run | owner only edits |
| routine_run / batch_job / automation_schedule | platformId, userId | owner only | + platform members (read-only) | owner only |
| agent_file | platformId, userId | owner only | never shared (contains document content) | owner only |
| agent_sharing_setting | platformId (+userId row-level opt-ins) | platform members read; admin writes platform switch; each user writes own opt-in | — | as stated |
| browser_subscription / usage counters / payment logs / pricing | platformId (subject = platform, D6 pooled caps) | platform admin reads; system writes | — | webhooks/system only |

Notes:
- `projectId` is deliberately NOT the anchor — agent data is personal-within-platform. The
  blockunits isolation rule is satisfied by mandatory `platformId` filtering; `userId` adds the
  privacy boundary inside the tenant.
- Platform admins get **no special read access** to agent data. Admin ≠ visibility (D3).
- "Sharing ON" for a given owner's row means: `platform.agentSharingEnabled = true AND
  sharing_setting(owner).optedIn = true`. Both are live lookups (cached ≤60 s), evaluated at
  read time — turning either off hides data immediately.

### 2.3 Enforcement — two independent layers
1. **`agentScope()` helper** (`security/agent-scope.ts`): the ONLY way agent repositories build
   WHERE clauses. Signature forces the caller to state intent:
   `agentScope.ownerOnly({ principal })` | `agentScope.ownerOrShared({ principal, kind })` |
   `agentScope.platformBilling({ principal })`. There is no "unscoped" variant. A lint rule
   (`no-restricted-imports` shaped) forbids importing the agent repos outside the module, and
   code review checks that no controller hand-writes a filter. Memory repositories only expose
   `ownerOnly`.
2. **Postgres RLS backstop** (`security/rls.ts`): every agent table gets
   `ENABLE ROW LEVEL SECURITY` + policies expressed against session GUCs
   (`app.current_user_id`, `app.current_platform_id`, `app.sharing_context`). The scope helper
   wraps agent queries in a transaction that `SET LOCAL`s the GUCs (required because the pool
   shares connections — GUCs must be transaction-local, never session-local). The app's DB role
   is NOT `BYPASSRLS`. Result: a buggy query without the helper returns **zero rows**, not a
   leak. RLS policies for memory tables encode owner-only with no sharing clause at all.
   - **Migration-runner caveat:** migrations run as the same role; policies are written so DDL
     and the migration transaction (no GUCs set) still work (`FORCE ROW LEVEL SECURITY` is NOT
     used on tables the migration seeds; seeding happens before `ENABLE`).
3. **Side channels** go through the same helper: the automation notifier resolves recipients
   via `ownerOnly`; batch export streams rows via `ownerOnly`; the (future) admin console gets
   only aggregate counts, never row contents.

### 2.4 One-platform-per-email + transfer/abandon (D2)
- Enforcement point: **invitation acceptance** (`user-invitations` flow) and sign-up with
  `platformId`. New check: if the invitee's identity already OWNS a personal platform with
  agent data or platform resources, the acceptance response returns a structured
  `409 PLATFORM_TRANSFER_REQUIRED` with options.
- **Transfer/abandon flow** (new endpoints under `/v1/agent/account/`):
  `GET transfer-preview` (what the personal platform contains) →
  `POST transfer` (move agent-scoped rows' `platformId` to the inviting platform — userId
  unchanged, privacy predicates unchanged) or `POST abandon` (soft-delete personal-platform
  agent data, then accept invite). Both are transactional, audited, and covered by dedicated
  tests (§10 T-13). Blockunits-native resources on the personal platform (flows, tables) are
  out of scope for transfer v1 — the preview lists them and transfer is blocked while they
  exist (explicit user deletion required). This protects blockunits data from a
  half-designed move.

---

## 3. Routing & endpoint matching (normative table)

Blockunits serves `/api/v1/...` (global prefix + URI versioning — same shape as the old
server, which minimizes extension churn). All agent routes are Fastify plugins using
`fastify-type-provider-zod` schemas + `securityAccess` configs. **Route-audit note:** exact
blockunits auth route paths are confirmed against `authentication` module source in Phase 0
(A-4) before the extension is touched — the table below marks them `[audit]`.

| Old (NestJS) | New (blockunits) | securityAccess | Notes |
|---|---|---|---|
| POST /auth/register | existing sign-up route `[audit]` | existing | + `usesBrowserAgent` marker via query/body extension IF needed; else drop (product scope comes from subscription) |
| POST /auth/login | existing sign-in `[audit]` | existing | unchanged blockunits code |
| POST /auth/google | existing federated-auth Google `[audit]` | existing | extension switches to blockunits' Google client flow |
| POST /auth/refresh | **removed** | — | single 7-day JWT model (D2/§2.1) |
| POST /auth/logout | existing sign-out `[audit]` / tokenVersion bump | existing | |
| GET /auth/me | existing identity/me `[audit]` | existing | |
| POST /agent/chat (SSE) | POST **/v1/agent/chat** (SSE) | `publicPlatform([USER])` + scope helper | body carries `protocolVersion` (D8) |
| POST /agent/runs/:id/observation (SSE) | POST /v1/agent/runs/:id/observation | same | |
| POST /agent/runs/:id/approve · /reject (SSE) | POST /v1/agent/runs/:id/approve · /reject | same | idempotent semantics preserved exactly |
| POST /agent/runs/:id/expand · /decline-expand (SSE) | POST /v1/agent/runs/:id/expand · /decline-expand | same | |
| GET/DELETE /agent/conversations[...] | /v1/agent/conversations[...] | same | soft-delete preserved |
| POST /agent/grammar | POST /v1/agent/grammar | same | quickTools metering |
| /agent/memory/settings · facts · recall · entities | /v1/agent/memory/... (same sub-paths) | same, **ownerOnly** repos | |
| /agent/workflows/* | **/v1/agent/routines/*** (D5): `GET /`, `POST from-run/:runId`, `GET runs/history`, `GET/PATCH/DELETE :id`, `PATCH :id/params`, `PATCH :id/steps/order`, `DELETE :id/steps/:stepId`, `POST :id/duplicate` | same | rename is total: entities, routes, events, UI copy |
| POST /agent/automation/replay (SSE) | POST /v1/agent/automation/replay | same | |
| /agent/automation/batches[...] (incl. upload/cancel/retry-failed/export) | /v1/agent/automation/batches[...] | same | multipart via existing fastify multipart support |
| /agent/automation/schedules[...] | /v1/agent/automation/schedules[...] | same | |
| POST /agent/automation/presence/heartbeat · GET work/claim | /v1/agent/automation/presence/heartbeat · /v1/agent/automation/work/claim | same | |
| POST /agent/files · GET /agent/files/:id/download | /v1/agent/files · /:id/download | same | |
| /intellisper/billing/* | **/v1/agent/billing/***: pricing, subscription, usage, subscribe, verify-return, upgrade, downgrade, downgrade/cancel, cancel, payment-method/remove | JWT routes: `publicPlatform([USER])`; admin-ish ops (subscribe/cancel) additionally require platform-owner check | D6: module clearly marked browser-side |
| /intellisper/billing/webhooks/:provider | POST /v1/agent/billing/webhooks/paystack · airwallex · paypal | `securityAccess.public()` + signature verification over **raw body** | Fastify raw-body capture configured for exactly these routes |
| Socket.IO /automation namespace | same namespace on the blockunits socket server, JWT-authenticated handshake | n/a | reuses blockunits' existing Socket.IO instance; separate namespace = zero interference with worker/UI sockets |
| GET /geo/country | GET /v1/agent/geo/country | `public()` | via `safeHttp` |

**SSE on Fastify** (new helper `helper/sse.ts`): writes `text/event-stream` headers +
`data: {json}\n\n` frames from an async generator via `reply.raw`; disables compression for
these routes; heartbeat comment frames every 15 s (proxy keep-alive); guarantees a terminal
`error` frame + `end` in `finally`. Unit-tested standalone (§10 T-1).

**Protocol versioning (D8):** `PROTOCOL_VERSION = 1` in shared. Chat/resume bodies carry
`protocolVersion`; if absent or unsupported the server responds with a single
`{type:'update_required', minVersion}` event and ends. Event schema changes from now on are
additive-only (enforced by a shared-types test that snapshots the event union).

**Client retargets** (Phase 9): extension `VITE_API_BASE_URL` → blockunits server; api-client
paths per this table; token-store single-token; `workflow.*` messages → `routine.*`;
web-frontend BFF `INTELLISPER_API_BASE` + auth proxy adapted to blockunits auth.

---

## 4. Data layer & migrations

All entities are TypeORM **EntitySchema** files (blockunits convention), added to
`getEntities()` in `database-connection.ts`, with migrations imported + registered in
`getMigrations()` in `postgres-connection.ts` (the entity-registration rule — no
auto-discovery). Historical migrations remain frozen; everything here is new files.

**New entities (16):** `AgentConversation, AgentMessage, AgentRun, AgentAction, MemoryFact,
MemoryEntity, MemoryRelation, Routine, RoutineStep, RoutineRun, BatchJob, AutomationSchedule,
AgentFile, AgentSharingSetting, BrowserSubscription, BrowserPaymentLog, BrowserPricingConfig,
BrowserUsageCounter` (+ reuse blockunits' existing audit-events table for agent audit via new
event names — no new audit entity).

**Migrations to run (in order, each idempotent-guarded, each registered):**

| # | Migration | Contents |
|---|---|---|
| M1 | `CreateBrowserAgentCore` | agent_conversation/message/run/action + indexes (platformId, userId, conversationId, runId, status) |
| M2 | `CreateBrowserAgentMemory` | `CREATE EXTENSION IF NOT EXISTS vector` (wrapped in a DO-block that records availability instead of failing — D4 degrade), memory_fact (+`embedding vector(1536)` when available, else deferred column), memory_entity, memory_relation, HNSW partial index |
| M3 | `CreateRoutines` | routine, routine_step, routine_run |
| M4 | `CreateBrowserAutomation` | batch_job, automation_schedule |
| M5 | `CreateAgentFiles` | agent_file (contentHash unique per user) |
| M6 | `CreateAgentSharing` | agent_sharing_setting + `platform.agentSharingEnabled` boolean column (default false) |
| M7 | `CreateBrowserBilling` | browser_subscription, browser_payment_log (unique provider+reference), browser_pricing_config (+seed rows), browser_usage_counter (unique subject+period+metric) — all named/commented as browser-side (D6) |
| M8 | `EnableAgentRls` | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policies per §2.3 for every agent table (runs LAST, after all seeds) |

pgvector: dev compose already runs `pgvector/pgvector:pg16` (verified — blockunits' KB/copilot
schema already needs it), so M2's extension normally succeeds. Degrade path: a
`memoryCapability` service probes `pg_extension` at boot; absent → memory tools unregistered,
memory endpoints return `501 MEMORY_UNAVAILABLE`, everything else works (D4).

**Rollback:** each migration ships a tested `down()`. Because everything is additive and
flag-gated, rollback = flag off; DDL rollback only for catastrophic cases.

---

## 5. Engine port (Phase 3 core)

Port `agent-runtime.service.ts` semantics 1:1 into `engine/agent-engine.ts` with these
structural changes only:
- **Pure engine (D7):** `drive(runId, principalCtx): AsyncGenerator<AgentEvent>` with injected
  ports (repos via scope helper, model provider, tool registry, entitlements, audit, clock).
  No Fastify/HTTP imports — verified by a dependency lint test. The API hosts it; a future
  worker host consumes the identical interface.
- Checkpoint semantics preserved **exactly**: `loopState` opaque carry, `pendingCalls` batch
  drain before next model turn, `actionCallIds` mapping, sanitised observations
  (`UNTRUSTED_PAGE_CONTENT` re-wrap, screenshot stripping), research state, replay state,
  escalation state, `seedMessages`. These are the five known landmine areas from the original
  build (tool_use/tool_result pairing, checkpoint field loss on resume, mid-batch pauses,
  failed-trigger-style output slots, idempotent approve/reject) — each gets a dedicated unit
  test asserting the historical bug can't recur (§10 T-2).
- Replay engine ported with the same bounds (heal ≤2/step, retries ≤2/step, maxSteps guard,
  condition/extract/repeatFrom semantics, unattended parking of consequential steps).
- Model tiers, stall-based escalation (Haiku→Sonnet→Opus w/ plan gate failing CLOSED), prompt
  caching, `billedTokens` accounting — ported unchanged inside `model-provider/`
  (deps `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai` added to the api package). The facade
  stays isolated from blockunits' own `ai_provider` stack (a marked TODO documents future
  unification — same treatment as billing, D6).
- Research fetching is rebuilt on **`safeHttp`** (`@intelblocks/server-utils`) per the
  blockunits rule — it already provides the DNS-rebind-safe SSRF filter; the port keeps the
  redirect re-check and size/time caps on top. The bespoke SSRF guard is NOT ported (one SSRF
  stack, the house one).

---

## 6. Billing port (D6)

`ee/browser-agent/billing/` — a self-contained copy of the browser-side billing:
entitlements resolver (plan cache 60 s), atomic monthly meter with over-cap refund,
plan/feature/caps config (env-overridable, same names), subscribe/upgrade/downgrade/cancel
orchestration, three provider adapters, webhook verification over raw body, engagement
marking. Subject is **always the platform** (D2/D6 pooled caps) — `subjectType` collapses to
`platform`.

Markers required by D6 (checked in review):
- Module README + top-of-file banner comments: "Browser-agent billing — ported from
  intellisper-server; intentionally parallel to platform billing."
- A `TODO(billing-unification)` comment block at each seam (entitlements resolve, checkout,
  webhooks, usage endpoint) describing exactly what merging into `platform_plan` will require.
- One entitlement authority per feature (D6): agent tool gates consult ONLY this module;
  nothing here reads or writes `platform_plan`.

---

## 7. Shared blockunits resources — touchpoints, flow analysis, and mandatory flow tests

These are the ONLY places pre-existing blockunits code is involved. Each gets: (a) how the
existing flow works, (b) what we add, (c) the regression tests proving the existing flow is
unchanged (requirement: test the flows involved).

| # | Shared resource | Existing flow | Our use | Mandatory flow tests |
|---|---|---|---|---|
| S1 | **Authentication & sign-up provisioning** | sign-up (no platformId) → identity + platform + personal project; JWT issuer `intellisper`; tokenVersion invalidation | consumed as-is by extension/web | full auth suite re-run unchanged; new test: sign-up still provisions platform+project with agent flag ON and OFF |
| S2 | **User invitations** | invite → (auto-)accept → membership | we ADD the one-platform check + 409 transfer path at acceptance | existing invitation tests unchanged; new: invitee without personal data accepts exactly as before (byte-identical response); invitee with data → 409 + transfer/abandon paths |
| S3 | **File service / S3** | `getLocationForFile(type)` returns DB for all non-expiring types (KNOWN gotcha — PACKAGE_ARCHIVE bloat issue) | agent files must NOT land in Postgres: new `FileType.AGENT_FILE` added to the S3-eligible branch (or agent files use the S3 helper directly, bypassing `FileLocation.DB`) — decision recorded in progress file at Phase 5 | existing file-service tests unchanged; new: AGENT_FILE goes to S3 when configured; PACKAGE_ARCHIVE behavior untouched (explicit assertion) |
| S4 | **Socket.IO server** | worker RPC + UI events on existing namespaces | new isolated `/automation` namespace, JWT handshake | existing websocket tests unchanged; new: cross-namespace isolation (agent events never reach U