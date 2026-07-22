# Intellisper Browser Agent → Blockunits Server — Implementation Plan

> **Goal.** Re-implement the Intellisper browser agent's server functionality natively inside the
> blockunits Fastify server, so the Chrome extension and the blockunits web frontend call ONE
> backend. This is a **rewrite into blockunits idioms**, not a code import. The NestJS
> `server/` + `intellisper-server/` become reference specs only.
>
> **Non-negotiables (user mandate).** Nothing breaks, leaks, or is lost on either side. The
> browser agent must work as before or better. Account/access scoping must be explicit and
> enforced hard. Tests (unit + integration + API + flow) accompany every phase. Where blockunits
> resources are shared, the shared flow is tested. An implementation-progress file is updated at
> every phase.
>
> **Companion docs:** `INTELLISPER_BROWSER_AUTOMATION_REPORT.md` (source-side architecture, repo
> root) and the locked decisions in memory `intellisper-merge-decisions`.
>
> **STATUS: PLAN ONLY — no implementation has begun. Do not start until this plan is approved.**

---

## 0. Locked design decisions (context — see memory `intellisper-merge-decisions`)

1. **Green-field** — no existing browser-agent users; no data migration/back-fill.
2. **Tenancy** — solo signup auto-provisions a personal platform+project (blockunits already does
   this on first sign-up). One platform per email. Invite of an email that already has a personal
   platform → transfer/abandon-personal-platform flow. Product-scoped subscriptions
   (browser / blockunits / full).
3. **Privacy (hard)** — agent rows scoped `platformId + userId`. Admin sharing switch only
   *unlocks* the option; each user opts IN individually; no retroactive exposure.
   `memory_fact` is ALWAYS private regardless of switches. Enforcement = mandatory deny-by-default
   scope helper + Postgres RLS backstop + same predicate on every side channel (admin views,
   audit, exports, emails).
4. **Memory** — one service, scope discriminator `USER` (private) vs `PROJECT`/`PLATFORM`
   (flows/copilot/MCP). Degrade gracefully without pgvector. Wire browser agent first.
   (pgvector is already a de-facto blockunits requirement — `docker-compose.dev.yml` uses
   `pgvector/pgvector:pg16`.)
5. **Naming** — agent workflows are **"Routine"** (user-facing). Internal entity/table names use
   `routine`.
6. **Billing** — port Intellisper billing ALONGSIDE `platform_plan` (clearly marked; integration
   TODOs commented). One entitlement authority per feature. Caps pooled per platform.
7. **Agent loop** — engine written **worker-ready** (checkpoint-in / events-out, zero HTTP/SSE
   coupling), HOSTED in the API process at launch; liftable to workers later without rewrite.
8. **Protocol** — extension sends a protocol version on connect; server speaks it or replies
   "update required"; SSE event changes are additive-only from release one.

---

## 1. Grounding facts verified against blockunits source (routing/scoping accuracy)

These are the exact blockunits mechanisms the plan builds on — verified, not assumed.

### 1.1 Security / route model (`core/security/authorization/fastify-security.ts`)
Routes declare `config.security` via `securityAccess.*`. Relevant builders:
- `securityAccess.project(allowedPrincipals, permission, projectResource)` — extracts `projectId`
  from the request (via `ProjectResourceType.TABLE`/`QUERY`/`BODY`/`PARAM`), asserts the principal
  is a **member of that project** (and has `permission` if given), and puts `request.projectId` on
  the request. **This is the primary builder agent routes use.**
- `securityAccess.platformAdminOnly([USER|ENGINE|SERVICE])` — platform owner only; exposes
  `request.principal.platformId`. Used for the admin **sharing switch** endpoint.
- `securityAccess.publicPlatform(...)`, `securityAccess.public()`, `securityAccess.unscoped(...)`,
  `securityAccess.engine()`, `securityAccess.worker()`.
- Principals: `PrincipalType.{USER, ENGINE, SERVICE, WORKER, UNKNOWN, ONBOARDING}`. Agent user
  requests are `USER`; the extension holds a normal blockunits USER JWT (issuer `intellisper`).

**Consequence for scoping:** every agent-data route is `securityAccess.project([USER], <perm>,
{ type: ProjectResourceType.BODY|PARAM|QUERY, ... })`. The framework guarantees the caller belongs
to the project; **our scope helper then additionally enforces the per-user (and sharing) filter**
that blockunits' project-membership check does NOT cover (blockunits assumes project resources are
shared by members; agent data is not — §4).

### 1.2 Route idiom
Controllers are `FastifyPluginAsyncZod`; routes use `app.post('path', { config: { security }, schema: { tags, description, body|querystring|params, response } }, handler)`. API prefix is
`/api/v1`. Modules are registered in `app.ts` under the `IbEdition` switch. **Do not widen edition
gates casually** — agent module is registered for the same editions we deploy (`cloud`; also `ce`
if the browser agent must run in self-host — decision D-1 below).

### 1.3 Data isolation rule (`.claude/rules/data-isolation.md`)
Every query MUST filter by `projectId`/`platformId`. Our helper extends this to `+ userId +
sharing` for agent tables.

### 1.4 Entity registration rule (`.claude/rules/entity-registration.md`)
New TypeORM entities MUST be added to `getEntities()` in `database-connection.ts` AND get a
migration registered in `getMigrations()` in `postgres-connection.ts`. **No auto-discovery.**
Historical migrations are FROZEN.

### 1.5 Safe HTTP rule (`.claude/rules/safe-http.md`)
All outbound HTTP in server packages goes through `safeHttp` from `@intelblocks/server-utils`. The
ported research web-fetch MUST use `safeHttp` (replacing the agent's bespoke SSRF guard — behavior
preserved, mechanism swapped to the blockunits-sanctioned one).

### 1.6 Signup auto-provisioning (`.agents/features/authentication.md`)
`signUp()` — on first sign-up with no `platformId`, blockunits **already** creates a platform + a
personal project and auto-verifies/sends OTP. Our personal-platform tenancy rides this existing
path; we add the product-scope + one-platform-per-email + invite-collision rules.

### 1.7 Test harness (`packages/server/api/test/`)
`helpers/test-setup.ts` (`setupTestEnvironment`) + `helpers/e2e-setup.ts` +
`test/integration/{ce,ee,cloud}/...`. Windows runner: `vitest.winrun.mts` with
`WINRUN_INCLUDE='test/unit/**/*.test.ts'`. Baselines to preserve (from onboarding): api
tsconfig.app = 28 errors, engine tsconfig.lib = 8, vitest 458 passed / 15 failed in 5 known files.
**Any deviation from those baselines is a regression.**

### 1.8 Worker/engine + streaming machinery already present (reused, not rebuilt)
- BullMQ job broker + `jobQueue` + `WorkerJobType` enum (add agent job types here later, Phase 9).
- `engineResponseWatcher` + `user-interaction-watcher` (request↔worker round-trip with Redis
  pub/sub) — the pattern the agent loop's persist-and-resume mirrors; reused when the engine lifts
  to workers.
- Socket.IO gateway (`workers/machine`) — pattern for the automation presence gateway.
- `flowExecutionCache`, `distributedLock`, `distributedStore`, `apDayjs`, `apId`, audit
  (`applicationEvents`), `safeHttp`, `system`/`AppSystemProp` config.

---

## 2. Decisions to finalize BEFORE Phase 1 (small, blocking)

| # | Decision | Recommendation |
|---|---|---|
| D-1 | Editions the agent module registers under | `cloud` + `ee`; gate agent features behind a new `platform.plan.browserAgentEnabled` flag (degrade to off in `ce`). |
| D-2 | Model-provider integration | Port the Vercel-AI-SDK facade as a NEW blockunits server module `agent-model-provider` (do NOT reuse blockunits' existing `ai_provider`/copilot LLM stack — different contract, tier/caching logic). Keys from `system`/env, never client. |
| D-3 | pgvector policy text | Amend `AGENTS.md` "no custom extensions" to "pgvector permitted (already required by KB/copilot); features degrade gracefully when absent." |
| D-4 | Route namespace | **`/api/v1/browser-agent/*`** — NOT `/agent/*`: blockunits ALREADY has an `agentsModule` (`app/agents/`, registered app.ts:210) for its native AI-agent flow-step feature. Ours must be namespaced `browser-agent` everywhere (module dir `app/browser-agent/`, routes, entities kept distinct) to avoid collision. Sub-surface `/api/v1/browser-agent/automation/*`. Extension changes base path (one config line + protocol header). |
| D-5 | Extension base-URL cutover | Extension `VITE_API_BASE_URL` → blockunits host `/api/v1`; add protocol-version header. Confirm CORS allowlist includes `chrome-extension://<id>` (blockunits equivalent of `AGENT_EXTENSION_IDS`). |
| D-6 | Token/issuer | Extension uses blockunits USER JWT (issuer `intellisper`). Port `/auth/google` audience-array logic into blockunits auth (accept Intellisper Google client id). Replace the agent's own JWT. |

---

## 3. Data model (new entities — all follow §1.4 registration)

All agent tables carry `platformId` (NOT NULL, indexed) + `userId` (NOT NULL, indexed) + standard
`BaseModelSchema` (id/created/updated). `projectId` included where a resource is project-anchored
(runs/routines) for blockunits project-scope compatibility; memory is platform+user only.

Migrations are idempotent `.sql`-style TypeORM migrations registered in `getMigrations()`. Each
migration also installs the **RLS policy** for its table (§4.3). One migration file per logical
group; ALL enum-ish columns are `varchar` + CHECK (blockunits convention).

| Entity / table | Key columns | Scope | Notes |
|---|---|---|---|
| `agent_conversation` | userId, platformId, projectId, title, deletedAt | user-private (sharable) | soft-delete |
| `agent_message` | conversationId(FK), role, content, toolCalls(jsonb) | inherits conversation | — |
| `agent_run` | conversationId(FK), platformId, userId, projectId, status, stepCount, tokenCost(bigint), haltReason, checkpoint(jsonb), startedAt/endedAt | user-private | checkpoint = resumable state |
| `agent_action` | runId(FK), type, targetRef, args(jsonb), class, status, approvedBy, result(jsonb) | inherits run | — |
| `memory_fact` | userId, platformId, kind, content, source, embeddingModel, `embedding vector(1536)` (unmapped) | **ALWAYS user-private** | HNSW cosine partial index; never sharable |
| `memory_entity` | userId, platformId, type, name, attributes(jsonb) | user-private | — |
| `memory_relation` | fromEntity(FK), toEntity(FK), relation | user-private | — |
| `routine` | userId, platformId, projectId, name, description, params(jsonb), version, deletedAt | user-private (sharable) | renamed from "workflow"; soft-delete |
| `routine_step` | routineId(FK), ordinal, action, locators(jsonb), intent, config(jsonb) | inherits routine | — |
| `routine_run` | routineId(FK), platformId, userId, projectId, batchJobId, rowIndex, paramValues, agentRunId, status, progress(jsonb) | user-private (sharable) | thin history |
| `agent_batch_job` | userId, platformId, routineId, status, counters | user-private (sharable) | — |
| `agent_schedule` | userId, platformId, routineId, cron, tz, paramSets, notify, lastRun/nextRun | user-private | — |
| `agent_file` | userId, platformId, conversationId, name, mime, sizeBytes, contentHash, s3Key, version, deletedAt | user-private | S3 dedupe |
| `agent_audit_log` | userId, platformId, runId, event, detail(jsonb) | user-private (admin-viewable via predicate) | append-only |
| `agent_usage_counter` | subjectId(=platformId), period(YYYY-MM), metric, count | platform-pooled | atomic upsert; UNIQUE(subjectId,period,metric) |
| `intellisper_subscription` | platformId/userId, plan, status, provider ids, encryptedToken, period bounds | platform | ported ALONGSIDE platform_plan; marked browser-side |
| `intellisper_payment_log` | subjectId, type, status, provider, providerReference(UNIQUE w/ provider), amount, rawEvent | platform | idempotent |
| `intellisper_pricing_config` | plan, countryCode(UNIQUE w/ plan), currency, monthlyAmount | — | server-authoritative pricing |
| `platform_plan` (existing) | + `browserAgentEnabled` bool, + `agentSharingUnlocked` bool | platform | ALTER existing table (guarded ADD COLUMN) |
| `user` (existing) | + `agentSharingOptIn` bool (default false) | user | ALTER; per-user opt-in |

**Migration ordering:** extension enable (`CREATE EXTENSION IF NOT EXISTS vector`) → tables →
indexes → RLS policies → ALTERs on `platform_plan`/`user`. Each registered in `getMigrations()` in
dependency order.

---

## 4. Access scoping & privacy enforcement (the crux — spelled out)

### 4.1 The visibility predicate
For a resource row `r` accessed by user `u` on platform `p`:
```
visible(r, u, p) =
    r.platformId = p                                   -- tenant boundary (always)
    AND (
        r.userId = u.id                                -- owner always sees own
        OR (
            SHARABLE(r.type)                            -- memory_fact is NEVER sharable
            AND platform_plan(p).agentSharingUnlocked   -- admin unlocked the option
            AND owner(r).agentSharingOptIn = true       -- the OWNER opted in
        )
    )
```
- `SHARABLE` = { conversation, run, routine, routine_run, batch, action, audit } — **NOT
  memory_fact / memory_entity / memory_relation** (hard-coded exclusion).
- Admin unlocking `agentSharingUnlocked` flips NO data visible by itself; only owners who set
  `agentSharingOptIn=true` expose *their* sharable rows. No retroactive exposure.
- Writes are ALWAYS `userId = u.id` (you can only ever create/modify your own agent data;
  sharing is read-only visibility).

### 4.2 Mandatory scope helper (application layer, deny-by-default)
`agentScope.ts` exports the single sanctioned way to read agent data:
- `agentScope.forRead({ userId, platformId, resourceType }): QueryFilter` — returns the predicate
  above; every repository read composes it. No controller/service hand-writes the filter.
- `agentScope.assertOwned(row, userId)` — for writes/mutations.
- Lint/review gate: a repo-level check (grep in CI test) that no agent repository builds a raw
  `where` on an agent table without going through `agentScope`. (Same spirit as the
  data-isolation rule.)

### 4.3 Enforcement backstop — REVISED (Phase 1 finding)
**RLS-via-session-GUC is NOT viable as the transparent backstop in this codebase and is dropped as
the primary mechanism.** Verified: repos are obtained via `repoFactory` →
`databaseConnection().getRepository()` on a **shared connection pool**, and the default read path
does NOT wrap queries in a transaction (`core/db/transaction.ts` exists but reads don't use it).
A session-level `SET` would leak the GUC across pooled requests (unsafe); a `SET LOCAL` is only safe
inside an explicit transaction, so making RLS universal would force EVERY agent read through a
transaction wrapper — invasive, and silently bypassable by any repo call outside it (the opposite of
"the DB refuses"). Fighting the framework here buys a weaker guarantee, not a stronger one.

**Replacement (blockunits-native, stronger in practice) — a two-layer application guarantee:**
1. **Mandatory deny-by-default scope helper (§4.2)** is THE enforcement — the single sanctioned
   read/write path, mirroring blockunits' own `entitiesMustBeOwnedByCurrentProject` hook + the
   data-isolation rule.
2. **Automated enforcement gate (test)** — a unit/integration test that statically scans the
   `browser-agent` module and FAILS if any agent-table query is constructed without going through
   `agentScope` (this is the "you cannot forget" mechanism that RLS was meant to provide). Paired
   with the §10 red-team isolation tests that prove no leakage through the real endpoints.
3. **RLS kept as OPTIONAL defense-in-depth, scoped to write paths only** — where a mutation already
   runs inside `transaction()`, a preHandler may `SET LOCAL ib.user_id/ib.platform_id` and the table
   may carry a matching policy. Applied opportunistically, documented as belt-and-suspenders, NOT
   relied upon as the universal backstop. `memory_fact` policy (if applied) has NO sharing branch.

**Test:** the enforcement-gate scan + red-team endpoint tests are the isolation proof, not a
GUC-swap query. (This supersedes the earlier "GUCs set to the wrong user → zero rows" test.)

### 4.4 Side channels (explicitly covered — where hard privacy usually fails)
Every one of these goes through the SAME predicate:
- Admin dashboards / any platform-admin listing of agent data.
- `agent_audit_log` viewer.
- Batch export (CSV/JSON of routine_run output).
- Email notifications (batch finished / needs-attention) — recipient resolution honors ownership.
- Memory management API (list/recall/forget) — always user-only.
- **Test each side channel** with a non-owner + admin-unlocked + owner-not-opted-in → no leak.

### 4.5 Tenancy provisioning & invite collision — REFINED (Phase 2 grounding)
Verified blockunits reality: (a) sign-up with no platform returns an **ONBOARDING token**; the
personal platform is created by a SEPARATE `POST /api/v1/platform` (`createPlatformWithProject`),
not inline in `signUp()`. (b) blockunits **natively allows one identity across many platforms**
(`switch-platform`, `getPreferredPlatformId`), so one-per-email is an ADDITIVE CONSTRAINT, not a
tightening of an existing rule. (c) The two browser-agent plan flags are kept OUT of the shared
`PlatformPlan` contract — managed via scoped raw SQL in `browserAgentTenancyService` — so blockunits'
plan/billing types are untouched.
- **Product scope:** carried as an OPTIONAL `productScope` (BROWSER|BLOCKUNITS|FULL) on
  `SignUpRequest` + `CreatePlatformRequest` (additive, backward-compatible — absent = stock
  blockunits). `POST /platform` sets `platform_plan.browserAgentEnabled` for BROWSER/FULL.
- **One platform per email:** enforced in the `POST /platform` handler via
  `assertCanCreateBrowserAgentPlatform` — a no-op unless the scope includes the browser agent, so
  pure-blockunits multi-platform creation is unaffected. An identity may own ≤1 browser-agent
  platform.
- **Invite collision:** an invited email that already owns a personal browser-agent platform is NOT
  auto-mutated by blockunits' invitation flow (which is left untouched — the user simply gains
  membership of the team platform, coexisting with their personal one). The transfer/abandon choice
  is offered by a DEDICATED browser-agent endpoint the client calls
  (`POST /browser-agent/tenancy/transfer-personal-platform`): **transfer** = move the user's personal
  browser-agent data to the team platform then disable/remove the personal browser-agent workspace;
  **abandon** = delete the personal browser-agent workspace's data; **decline** = keep both (no-op).
  This keeps the sensitive shared invitation path out of scope for modification.
- **Invite collision** (invited email already owns a personal platform): **transfer/abandon-
  personal-platform flow** — a dedicated endpoint that (a) confirms intent, (b) migrates or
  discards the user's personal-platform agent data per their choice, (c) re-homes the identity to
  the inviting platform. Fully tested (both transfer and abandon branches, and the decline branch).

---

## 5. Module layout (blockunits `packages/server/api/src/app/agent/`)

```
app/agent/
  agent.module.ts                 # registers all controllers + preHandler (RLS GUC set) in app.ts
  scope/agent-scope.ts            # §4.2 mandatory scope helper
  engine/
    agent-engine.ts               # PURE engine: checkpoint-in → events-out (no HTTP/SSE)
    agent-engine.types.ts         # RunCheckpoint, AgentEvent (ported), ReplayCheckpoint
    tier-router.ts                # stall-based escalation (Haiku→Sonnet→Opus)
  runtime/
    agent-runtime.service.ts      # thin: persists runs/actions, drives engine, streams events
    replay.service.ts             # deterministic routine replay (condition/extract/self-heal)
  controllers/
    agent-chat.controller.ts      # POST /agent/chat, /runs/:id/observation|approve|reject|expand|decline-expand (SSE)
    conversation.controller.ts    # GET/DELETE /agent/conversations[...]
    memory.controller.ts          # /agent/memory/*
    routine.controller.ts         # /agent/routines/*  (was "workflows")
    file.controller.ts            # /agent/files
    grammar.controller.ts         # POST /agent/grammar
    automation.controller.ts      # /agent/automation/{replay,batches,schedules,presence,work}
  tools/                          # page-intelligence, browser-action, multi-tab, research, memory, routine, file
  memory/
    memory.service.ts             # dual-scope (USER private | PROJECT/PLATFORM) pgvector service
    auto-capture.service.ts
  research/web-fetch.service.ts   # uses safeHttp (§1.5)
  files/agent-file.service.ts     # S3 via blockunits StorageService
  entitlements/
    agent-entitlements.service.ts # ports Intellisper caps ALONGSIDE platform_plan
    tool-entitlements.ts
  billing/                        # ported Intellisper billing (MARKED browser-side + TODO merge)
  sse/sse.ts                      # SSE writer + protocol-version handshake (§8)
```
`agent-model-provider/` is a sibling top-level module (D-2). `automation` sub-parts (presence
gateway, batch/schedule BullMQ processors) live under `agent/automation/`.

---

## 6. Routing & endpoint matching (exact — parity with the extension)

Every route: `securityAccess.project([USER], <Permission>, { type: ProjectResourceType.<X>, ... })`
unless noted. New `Permission` entries (READ/WRITE pairs) added to the shared `Permission` enum +
role defaults (§1, `packages/shared` bump required). SSE routes stream `data: {json}\n\n` and END
after action/confirmation/expansion events (§ engine contract).

| Method | Path (`/api/v1`) | Security | projectId source | Notes |
|---|---|---|---|---|
| POST | `/agent/chat` | project([USER], AGENT_RUN_WRITE, BODY) | body.projectId (default personal project) | SSE; protocol-version header required |
| POST | `/agent/runs/:id/observation` | project([USER], AGENT_RUN_WRITE, TABLE:agent_run) | run→conversation→project | SSE resume |
| POST | `/agent/runs/:id/approve`\|`/reject` | project([USER], AGENT_RUN_WRITE, TABLE:agent_run) | run | SSE |
| POST | `/agent/runs/:id/expand`\|`/decline-expand` | project([USER], AGENT_RUN_WRITE, TABLE:agent_run) | run | SSE |
| GET | `/agent/conversations` | project([USER], AGENT_READ, QUERY) | query.projectId | list |
| GET | `/agent/conversations/:id/messages` | project([USER], AGENT_READ, TABLE:agent_conversation) | conv | — |
| DELETE | `/agent/conversations/:id` | project([USER], AGENT_WRITE, TABLE:agent_conversation) | conv | soft-delete |
| GET/PATCH | `/agent/memory/settings` | project([USER], AGENT_READ/WRITE, QUERY) | query.projectId | auto-capture opt-out |
| GET | `/agent/memory/facts`\|`/recall`\|`/entities` | project([USER], AGENT_READ, QUERY) | query | user-only always |
| DELETE | `/agent/memory/facts/:id` | project([USER], AGENT_WRITE, TABLE:memory_fact) | via platform | forget |
| GET | `/agent/routines` | project([USER], AGENT_READ, QUERY) | query | — |
| POST | `/agent/routines/from-run/:runId` | project([USER], AGENT_WRITE, TABLE:agent_run) | run | one-click save |
| GET/PATCH/DELETE | `/agent/routines/:id[...]` | project([USER], AGENT_READ/WRITE, TABLE:routine) | routine | rename/params/steps/duplicate |
| GET | `/agent/routines/runs/history` | project([USER], AGENT_READ, QUERY) | query | — |
| POST | `/agent/files` | project([USER], AGENT_WRITE, QUERY) | query | multipart upload |
| GET | `/agent/files/:id/download` | project([USER], AGENT_READ, TABLE:agent_file) | file | presigned |
| POST | `/agent/grammar` | project([USER], AGENT_QUICKTOOL, BODY) | body.projectId | meters quickTools |
| POST | `/agent/automation/replay` | project([USER], AGENT_RUN_WRITE, BODY) | body | SSE |
| POST/GET | `/agent/automation/batches[...]` | project([USER], AGENT_WRITE/READ, ...) | body/param | + upload multipart |
| POST | `/agent/automation/schedules[...]` | project([USER], AGENT_WRITE, ...) | body/param | cron |
| GET | `/agent/automation/work/claim` | project([USER], AGENT_RUN_WRITE, QUERY) | query | unattended claim |
| POST | `/agent/automation/presence/heartbeat` | project([USER], AGENT_READ, QUERY) | query | HTTP fallback |
| PATCH | `/agent/sharing` (admin) | **platformAdminOnly([USER])** | principal.platformId | flips `agentSharingUnlocked` |
| PATCH | `/agent/sharing/opt-in` (user) | project([USER], AGENT_WRITE, QUERY) | query | per-user `agentSharingOptIn` |
| billing | `/intellisper/billing/*` | publicPlatform/project per route; **webhooks public + signature** | — | ported alongside |
| — | Google OAuth audience array | in blockunits `authentication` | — | accept Intellisper client id (D-6) |

**Endpoint-matching guard (test):** an API test asserts every path the extension currently calls
(enumerated from `extension/src/shared/api-client.ts`) resolves on the new server with the correct
method + auth outcome. This is the "nothing the extension calls 404s / mis-auths" gate.

---

## 7. Shared-resource flows (blockunits code the agent touches — each TESTED)

Every shared touchpoint gets an explicit integration/flow test proving the blockunits side is
unaffected AND the agent side works:

1. **Signup / personal-platform provisioning** — agent product scope rides `signUp()`. Test:
   solo signup creates platform+project+plan with correct scope; blockunits-only signup unchanged;
   one-platform-per-email enforced; invite-collision transfer AND abandon branches.
2. **Auth / JWT / Google** — extension USER token accepted; issuer `intellisper`; Google audience
   array accepts Intellisper client id without breaking blockunits Google login. Test both logins.
3. **`platform_plan` gating** — new `browserAgentEnabled`/`agentSharingUnlocked` flags don't
   disturb existing plan reads (locked-icon logic). Test existing plan-gated UI paths still resolve.
4. **`Permission` enum + roles** — new agent permissions added; existing role defaults unchanged.
   Test existing RBAC on flows/connections still passes (regression).
5. **StorageService (S3)** — agent files reuse blockunits storage. Test agent upload/download +
   existing blockunits file paths (sample data, logs) unaffected.
6. **safeHttp** — research fetch uses it. Test SSRF rejection (private IP) + a public fetch.
7. **BullMQ / queues** — automation batch/schedule add queues; existing `workerJobs`/`runsMetadata`
   untouched. Test existing flow execution still enqueues/runs.
8. **Audit / applicationEvents** — agent audit rows don't pollute flow audit. Test both streams.
9. **Migrations** — full migrate from clean DB → all tables+RLS present; existing blockunits
   schema intact; `getEntities()`/`getMigrations()` consistent. Test the migration suite + the
   known typecheck baselines unchanged.
10. **Model provider** — new `agent-model-provider` module doesn't collide with existing
    `ai_provider`/copilot. Test copilot + AI-tab paths still work.

---

## 8. Engine contract & protocol versioning

- **Engine** = pure function surface: `drive(checkpoint) → AsyncIterable<AgentEvent>` + persistence
  callbacks injected. No `Res`/SSE/Fastify inside. Hosted in-API now (a controller adapts events →
  SSE); liftable to a `WorkerJobType.EXECUTE_AGENT_TURN` later with zero engine change.
- **AgentEvent union** ported verbatim (meta/text/tool/citations/action/awaiting_confirmation/
  research_source/awaiting_expansion/close_tabs/file_ready/done/halted/budget_exceeded/
  entitlement_required/usage_limit_reached/error) — the extension already speaks these.
- **Protocol version:** extension sends `x-intellisper-protocol: <int>` on connect; server's SSE
  layer checks it → serves or emits an `error`/`update_required` event. Events additive-only
  forever (new fields/events OK; never rename/remove). Documented in `sse/sse.ts` + a test asserting
  an unknown/old version is handled gracefully.

---

## 9. Phased delivery (each phase: code + tests green + progress file updated)

Every phase ends with: unit + integration + API tests for that phase green; the §1.7 baselines
unchanged; `IMPLEMENTATION_PROGRESS.md` updated; `npm run lint-dev` clean; a verify pass where a
runtime surface exists.

- **Phase 0 — Scaffolding & decisions.** Finalize D-1…D-6 + §2. Create the module skeleton,
  progress file, and the `platform.plan.browserAgentEnabled` flag (off). No behavior yet.
  *Tests:* module registers; server boots; baselines unchanged.
- **Phase 1 — Data model + RLS + scope helper.** All entities in `getEntities()`; migrations
  (extension→tables→indexes→RLS→ALTERs) in `getMigrations()`; `agentScope` helper.
  *Tests:* migration up on clean DB; RLS cross-user/cross-platform read = 0 rows; scope helper unit
  tests (owner / shared-unlocked-opted-in / shared-unlocked-not-opted-in / memory-never-shared);
  existing schema intact.
- **Phase 2 — Auth/tenancy.** Personal-platform product scope, one-platform-per-email,
  invite-collision transfer/abandon, Google audience array, extension JWT acceptance.
  *Tests:* all §7.1–7.2 flows incl. both collision branches; blockunits signup/login regression.
- **Phase 3 — Model provider + engine (pure).** Port facade (tiers/caching/fallback/billedTokens)
  + engine (loop, checkpoint, tier escalation) with NO transport. *Tests:* engine unit tests
  driving a mocked provider through tool-call/pause/resume/final; tier escalation; token accounting.
- **Phase 4 — Chat controller + SSE + tools (page/browser/memory-read).** Wire engine → SSE;
  persist runs/actions; the persist-and-resume round-trip; protocol version. *Tests:* full
  action round-trip (API), approve/reject, actionCallIds pairing, untrusted-content wrapping,
  endpoint-matching gate (§6).
- **Phase 5 — Memory service (dual scope) + entitlements skeleton.** pgvector service (USER private
  + PROJECT/PLATFORM), secret guard, dedupe, tiered recall, auto-capture, graceful degradation.
  *Tests:* remember/recall/forget/dedupe/secret-refusal; user-scoping (cross-user recall = none);
  degrade-without-pgvector; memory-never-shared even with sharing on.
- **Phase 6 — Research + files + grammar.** safeHttp fetch + distill; S3 files (read/edit,
  file_ready); grammar (quickTools meter, LCS highlights). *Tests:* SSRF reject/allow; file
  dedupe/version/download; grammar highlight determinism; shared StorageService flow.
- **Phase 7 — Routines (record/replay/self-heal).** Rename to "Routine"; record-from-run,
  param inference, buildReplayPlan, deterministic replay + condition/extract/self-heal.
  *Tests:* record→save→replay→self-heal→pause-for-human; consequential-on-resume gating.
- **Phase 8 — Automation (batch/schedule/presence).** BullMQ queues, admission control, Socket.IO
  presence, work-claim, notifier emails, CSV/Excel injection hardening. *Tests:* batch fan-out +
  admission + row-done counters; schedule fire; presence; injection-neutralization; email predicate.
- **Phase 9 — Billing port + entitlement enforcement + sharing switch.** Intellisper billing
  alongside `platform_plan` (marked + TODOs); per-tool gates; pooled caps; admin unlock + user
  opt-in endpoints. *Tests:* cap meter/refund; feature gate; pooled-per-platform; sharing predicate
  end-to-end across ALL side channels (§4.4); webhook idempotency + signature.
- **Phase 10 — Extension cutover + full E2E.** Base URL + protocol header; CORS; run every §16
  end-to-end user flow from the report against the new backend. *Tests:* the full flow matrix;
  final baseline + regression sweep; verify skill on the live stack.
- **Phase 11 — Optional worker lift.** Move engine to `WorkerJobType.EXECUTE_AGENT_TURN` when load
  demands (no engine change). *Tests:* parity with in-API hosting.

---

## 10. Testing strategy (requirement: unit + integration + API + flow)

- **Unit:** scope helper predicate, engine loop, tier router, memory dedupe/secret-guard, LCS
  grammar, param inference, replay self-heal, entitlement meter math.
- **Integration (DB):** RLS enforcement, migrations, memory pgvector SQL, batch counters,
  usage-counter atomicity/refund, cross-user/cross-platform isolation, sharing predicate.
- **API (HTTP):** every endpoint in §6 via the blockunits test harness (`createTestContext`),
  auth outcomes, the endpoint-matching gate, SSE round-trips, webhook signature.
- **Flow (shared-resource):** the ten flows in §7 — proving blockunits side unaffected + agent
  works.
- **Isolation red-team tests (explicit):** for every sharable resource type, attempt access as
  (a) other user same platform, sharing OFF; (b) other user, admin-unlocked but owner-not-opted-in;
  (c) other platform entirely; (d) memory with sharing fully ON — ALL must return zero. These are
  the "no leak" gates and are mandatory to pass before Phase 9 closes.
- **Baselines:** preserve §1.7 numbers; treat any deviation as a regression to fix before merging.
- Where a runtime surface exists, run the `verify` skill (drive the real flow, not just tests).

---

## 11. Risk register & mitigations

| Risk | Mitigation |
|---|---|
| Cross-user/platform data leak | Triple defense: scope helper + RLS + side-channel predicate + red-team tests (§10). |
| Breaking existing blockunits paths | Agent is additive + edition/flag-gated; §7 regression flow tests; baselines guarded. |
| pgvector absent in an environment | Graceful degradation (D-3); memory features flag off; core agent still works. |
| Migration collision / frozen-migration edit | New migrations only, registered in order; never touch historical migrations. |
| SSE load on light API process | Engine is worker-ready from day one; lift to workers (Phase 11) without rewrite. |
| Extension breakage on cutover | Protocol versioning (additive-only) + endpoint-matching gate + parity paths (D-4). |
| Double billing / entitlement gaps | One authority per feature; port-alongside not-replace; webhook idempotency tests. |
| Two "workflow" concepts confusing | "Routine" naming end-to-end (entity+route+UI). |
| Shared secret/creds handling | Keys server-side only via `system`/env; never client; safeHttp for outbound. |

---

## 12. Deliverables checklist (definition of done for the whole merge)

- [ ] All entities registered; all migrations + RLS applied cleanly on a fresh DB.
- [ ] Scope helper is the ONLY read path for agent data (CI grep gate).
- [ ] Every §6 endpoint resolves with correct auth; endpoint-matching gate green.
- [ ] Every §7 shared flow tested; blockunits baselines (§1.7) unchanged.
- [ ] Red-team isolation tests (§10) all return zero leakage; memory provably always private.
- [ ] Browser agent works end-to-end (report §16 flows) against the blockunits backend.
- [ ] Billing ported + marked + TODO-commented; caps pooled per platform; one authority per feature.
- [ ] Protocol version handshake live; events additive-only documented.
- [ ] `IMPLEMENTATION_PROGRESS.md` reflects every phase.
- [ ] `npm run lint-dev` clean; typecheck baselines preserved; `verify` run on live stack.
```
```
```
```
```
```
```

---

## Appendix A — files consulted (traceability)
- `AGENTS.md`, `.claude/rules/*`, `.agents/features/{authentication,flows,triggers,flow-runs,
  webhooks,blocks,workers,mcp,platform,projects,app-connections}.md`
- `core/security/authorization/fastify-security.ts`, `flows/flow/flow.controller.ts`
- `shared/.../principal-type.ts`, `database/database-connection.ts`, `postgres-connection.ts`
- `docker-compose.dev.yml` (pgvector), `packages/server/api/test/*`
- Browser-agent source: `INTELLISPER_BROWSER_AUTOMATION_REPORT.md` (+ verified runtime/types
  first-hand).
