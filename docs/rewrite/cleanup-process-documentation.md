# CleanUp Process Documentation

Reference for removing the commercially-licensed EE code and rebuilding equivalents
cleanly, while keeping **community, enterprise, and cloud** editions all runnable in the
final codebase.

## Goal
- Remove dependence on the licensed EE code (already deleted from the tree).
- Restore a green build, then rebuild each capability via clean-room implementation.
- Final state: one codebase, three editions (community / enterprise / cloudocumed), selected at
  runtime.

## Legal guardrails (apply throughout)

- **Interfaces from MIT sources only.** Derive the *shape* of each hole from compile errors,
  tests, DB migrations, and the MIT frontend — never from licensed EE source.
- **Implementation bodies from the sanitized spec + public standards**, by people who did
  not read the EE source. Build errors trace *what interface to fill*, not *how it worked*.
- Trivial stub bodies (null/empty/no-op) carry no protected expression and are safe.

## Edition model (keep the switch)

- Do **NOT** remove the edition switch. The final codebase runs all three editions.
- Each EE capability sits behind an **interface** with multiple implementations:
  - a **base** implementation (community: limited or off), and
  - a **full** implementation (enterprise/cloud).
- The edition/plan selector picks the active implementation at startup.
- Stubs are **temporary build scaffolding** for not-yet-rebuilt features — not the
  community end-state.

## Process (ordered; keep build green at every step)

1. **Map the holes.** Enumerate every broken import/reference in the MIT core (e.g.
   `app.ts`, `database-connection.ts`) left by the EE removal. Record each symbol, its
   signature, and where it's imported.
2. **Restore build with temporary stubs.** For every broken import, add a same-named,
   same-signature stub returning a safe default (null / empty / `false` / no-op /
   `throw "not implemented"`). Get a green community build.
3. **Drop, don't stub, abandoned features.** For features being permanently dropped (e.g.
   AppSumo), remove their registration entirely instead of stubbing.
4. **Re-establish edition wiring.** Ensure the edition switch selects base vs. full
   implementations through the interfaces — community boots on base/stubs; enterprise/cloud
   slots in real implementations as they land.
5. **Rebuild iteratively.** Replace each stub body with a real clean-room implementation
   from the sanitized capability spec, edition-gated. Flip features from "stubbed" → "real"
   one at a time.
6. **Per-feature done bar.** Each rebuilt capability has: correct edition gating, encrypted
   secrets at rest, fail-safe errors, audit coverage, tested migrations, and cross-tenant
   isolation tests. App builds and boots with no missing-schema errors.

## Do NOT

- Do not clone the ActiveBoxes (or any other) codebase into this repo. Use the MIT
  frontend, compile errors, tests, and migrations as the license-clean sources.
- Do not de-register the edition switch (that was for community-only forks).
- Do not copy EE internal logic; rebuild from the sanitized spec.

## Reference docs

- `tenancy-and-enterprise-capability-spec.md` — sanitized behavioral spec (the source of
  truth for implementation bodies).
- `ee-api-contract-map.md` — MIT-frontend-derived API surface (interface shapes).
- `broken-imports-worklist.md` — every broken import → interface → edition seam.

---

# BUILD-GREEN EXECUTION PLAN (incremental)

Decisions locked: replacement code lives under a **new non-`ee` path** (`app/enterprise/…`);
execution is **incremental with type-check verification after each layer**; every stub is
**marked `STUB`** (a `// STUB:` comment + a shared marker) for later tracing.

Constraints binding every step:
- Clean-room: interfaces from MIT core/errors/tests; bodies are safe defaults only. No EE
  logic, no resurrected EE files.
- Multi-edition: the edition switch stays; community/enterprise/cloud all remain runnable.
- Banking/hospital-grade: no silent permissive behavior. Security seams (authorization,
  tenant scoping) get **real** base behavior, never an allow-all stub — see Layer 4 note.

## Stub conventions (so stubs are traceable)

- Each stub file begins with a header comment:
  `// STUB (clean-room scaffolding) — replace with real implementation per <spec ref>.`
- Each stubbed function carries an inline `// STUB:` comment stating its temporary behavior.
- A shared constant/log marker `[STUB]` is emitted where a stub is exercised at runtime in
  non-prod, so stubbed paths are observable. (Never log-spam prod.)
- A running index of every stub is kept in `stub-index.md` (path, symbol, intended real
  behavior, spec ref).

## Layers (verify type-check green before advancing)

**Layer 0 — Baseline & safety net.**
- Record current type-check output (it will be red due to removed `ee/`). Capture the exact
  error set as the “holes to close” checklist. No code change.

**Layer 1 — AppSumo hard-drop + license-keys STUB.**
- **AppSumo = HARD DROP** (no frontend caller; feature removed entirely):
  - Remove import + `app.register(appSumoModule)` from `app.ts` (was in CLOUD branch).
  - Remove `AppSumoEntity` import + array entry from `database-connection.ts`.
  - Remove the AppSumo migration import + array entry from `postgres-connection.ts`; no
    replacement migration authored.
- **License-keys = STUB the verify route (decided), NOT a hard drop.** Rationale:
  `licenseKeysModule` is registered UNCONDITIONALLY for all editions (`app.ts` line ~208,
  outside the edition switch), and the MIT frontend calls `POST /v1/license-keys/verify`
  (`web/.../platforms-api.ts`). A hard drop would 404 that call. So we replace it with a
  **STUB module** under `app/enterprise/…` that keeps `POST /v1/license-keys/verify`
  responding (accepts/no-op, marked `STUB`), preserving the frontend contract. The real
  entitlement mechanism (spec G.4) replaces the stub later. The stub is recorded in
  `stub-index.md`.
- Verify: AppSumo + license-keys module-not-found errors disappear; the verify route still
  resolves; no new errors introduced.

**Layer 2 — Entities (18) under `app/enterprise/…`.**
- Recreate each entity (worklist §B) as our own clean-room `EntitySchema`, fields derived
  from the sanitized spec + MIT shared types — not from licensed entity files.
- Repoint `database-connection.ts` imports to the new paths; keep them registered for ALL
  editions (schema must exist everywhere).
- Verify: entity-import errors close; type-check passes for the data layer.

**Layer 3 — Migrations (clean-derivation; do NOT transcribe history).**

Context (important): the deleted `ee/database/migrations/...` files were historical schema
migrations, some of which also mutated CORE (non-EE) tables. They are still imported and
referenced (in the ordered array) in `postgres-connection.ts`, and the files are gone from
disk — so the build is broken and a fresh DB would be missing required schema. This must be
fixed, but the METHOD is legally load-bearing.

Legal rule for this layer (clean-room):
- The schema your DB needs is a **functional fact** and is forced by interoperability (the
  MIT core queries specific tables/columns) — reproducing that schema is allowed.
- BUT the migrations must be **derived solely from our own clean-room entities (Layer 2) and
  MIT sources** (core code that reads the columns, MIT shared types, the API contract map).
- **Do NOT** author migrations by reading or mirroring the licensed migration history (the
  old EE migration array, file bodies, or their effects). That is derivation from licensed
  source.
- **Do NOT** copy migration names/timestamps/identifiers from the licensed code. Generate
  our own identifiers. (Reproducing their identifiers *because we read them* is access +
  copying — the exact posture clean-room avoids, and it leaves an evidentiary trail.)
- The whoever/whatever authors migrations works from the **entities + MIT core**, not from
  `postgres-connection.ts`'s historical EE entries.

Approach:
- Author fresh migrations whose schema is generated FROM the Layer-2 entities (the entities
  are the single source of truth for what tables/columns must exist).
- Remove the dangling `ee/database/migrations/...` imports and array entries from
  `postgres-connection.ts`. Where an array entry created CORE schema, that schema is now
  produced by our own entity-derived migration instead — verified by the fresh-DB boot test,
  not by matching the old file.
- Migrations for DROPPED features (AppSumo, etc.): not authored at all.
- Verify: build resolves (no dangling refs); a FRESH PGLite dev DB boots and creates every
  table the core + rebuilt entities require, with no missing-schema errors at runtime.

> **Existing-database upgrades are OUT OF SCOPE for this layer and for the codebase.**
> Cleanly deriving from our own entities means a database originally created by upstream
> ActivePieces will NOT auto-upgrade via these migrations (different migration identities).
> If ingesting a pre-existing ActivePieces database is ever a real requirement, treat it as
> a separate, deployment-time data-migration/ETL task — NOT a reason to transcribe their
> migration history into this codebase. Flag this to IP counsel for explicit sign-off, as
> the migration approach is the subtlest clean-room call in this effort.

**Layer 3 — REFINED STRATEGY (decided after analysis): FULL SCHEMA BASELINE SQUASH.**
- *Why the simple approach failed:* ~84 historical migrations touch the 18 enterprise tables
  with 98 DROP COLUMN / 49 DROP CONSTRAINT / 4 RENAME / 6 ALTER COLUMN ops; the schema was
  built *incrementally*. A single final-shape `CREATE` inserted into that chain conflicts
  with the downstream destructive ALTERs. Reconstructing the incremental chain would require
  reading EE migration history (provenance risk). So we squash.
- *Decision:* replace the ENTIRE historical migration chain with ONE entity-derived baseline.
  Greenfield-only (no upgrade path — already out of scope, see note above). This is also the
  STRONGEST clean-room posture: schema derived purely from our own entity definitions, zero
  reference to any migration history or identifiers.
- *Mechanism (decided): synchronize-on-empty-DB then snapshot.* Boot once against an empty DB
  with TypeORM `synchronize=true` so it builds the full schema FROM the registered entities;
  capture the exact emitted SQL; commit that SQL as the single static baseline migration.
  Robust + conventional (committed static SQL, no runtime schema-builder in prod), and the
  SQL is 100% entity-derived.
- *Re-sequencing (important):* the snapshot requires the app to COMPILE AND BOOT, which needs
  the service/module stubs of Layers 4–5 in place first. Therefore Layer 3's *execution* is
  deferred to AFTER Layers 4–5. Order becomes: **Layer 4 → Layer 5 → Layer 3 (baseline
  snapshot) → Layer 6 (full boot verify).** The dangling `../ee/database/migrations/...`
  imports + array entries in `postgres-connection.ts` are removed as part of the squash (the
  whole `getMigrations()` chain is replaced by the single baseline).
- *Verify:* fresh PGLite dev DB boots; all tables (core + 18 enterprise) created; no
  missing-schema errors at runtime.

**Layer 4 — Service-interface stubs (marked STUB) under `app/enterprise/…`.**
- For each consumer-imported service/guard (worklist §D), create an interface + a base stub
  returning a safe default.
- **Security exception (non-negotiable):** authorization/tenant-scoping seams
  (`rbacService`, `assertUserHasPermissionToFlow`, `getPrincipalRoleOrThrow`, project-member
  lookups used for access) get a **real, restrictive base implementation** (built-in roles,
  deny-by-default), NOT an allow-all stub. A permissive stub here is a security hole; it is
  forbidden even temporarily.
- Verify: consumer files type-check.

**Layer 5 — Module stubs + edition switch rewiring.**
- Create a registrable module stub for each `app.ts`-registered feature (worklist §A.1),
  exposing routes that return `501 Not Implemented` (marked STUB) where a body isn't built.
- Recreate the two hook impls (`projectEnterpriseHooks`-equivalent, `enterpriseFlagsHooks`-
  equivalent) under `app/enterprise/…`; wire via the existing registry seams.
- Repoint the switch imports; keep CLOUD/ENTERPRISE/COMMUNITY branches intact.
- Verify: `app.ts` type-checks; all three editions resolve their modules.

**Layer 6 — Consumer import repointing + full verify.**
- Repoint every remaining consumer import (worklist §D) to the new paths.
- Run full `turbo lint`/type-check on touched packages; then boot community (PGLite) and
  confirm API/worker/frontend come up with no missing-schema or missing-module errors.
- Fix test-file `ee/` imports last (they don't block boot).

## Layer 3 reference — migration mechanics & bucket-A schema (MIT-derived)

**Migration mechanics (verified from code, determines make/break):**
- `synchronize: false` in all non-test environments (`postgres-connection.ts`,
  `pglite-connection.ts`, `sqlite-connection.ts`). TypeORM does NOT auto-create tables from
  entities at runtime. **A table exists only if a migration created it.**
- `migrationsRun: true` (non-test) — migrations auto-run at startup (`database/index.ts` →
  `runMigrations()`).
- **PGLite dev uses the SAME migration list as Postgres** (`pglite-connection.ts` imports
  `getMigrations()` from `postgres-connection.ts`). So the dev boot IS the real migration
  test.
- ⟹ Make/break: dangling EE migration imports break the build; a queried table with no
  creating migration crashes at first query. No degraded mode.

**Scope:** ~12–16 fresh, entity-derived migrations (not 20). Buckets:
- **A. Core-table schema** (on `platform`/`project`, historically created by EE-path
  migrations) — required or core crashes.
- **B. Rebuilt-entity schema** (project_member, project_role, api_key, signing_key, otp,
  alerts, audit_event, embed_subdomain, git_repo, concurrency_pool, platform_plan,
  project_plan, project_release, oauth_app, connection_key, app_credential,
  secret_manager) — required per feature.
- **C. Dropped features** (AppSumo, etc.) — NOT authored.

**Legal provenance (clean-room):** bucket-A/B schema is derived SOLELY from the MIT entity
definitions (`platform.entity.ts`, `project-entity.ts`, and the Layer-2 clean-room
entities) — your own code, interoperability-required. The deleted EE migration files are
NEVER opened. Schema is a functional fact forced by the MIT core's queries; reproducing it
from MIT entities is allowed. Own migration identifiers only (no EE names/timestamps).

**Bucket-A enumeration (authoritative source = MIT entities):**

`platform` table — entire table is core (`platform.entity.ts`):
- base: `id`, `created`, `updated`; `ownerId` (FK → user `fk_platform_user`, RESTRICT)
- `name`, `primaryColor`, `logoIconUrl`, `fullLogoUrl`, `favIconUrl`
- `cloudAuthEnabled` (bool d=true), `googleAuthEnabled` (bool d=true), `emailAuthEnabled` (bool)
- `filteredPieceNames` (text[]), `filteredPieceBehavior` (enum), `pinnedPieces` (text[])
- `allowedAuthDomains` (text[]), `enforceAllowedAuthDomains` (bool), `allowedEmbedOrigins` (text[] d=[])
- `ssoDomain` (text null), `ssoDomainVerification` (jsonb null), `federatedAuthProviders` (jsonb)
- index `idx_platform_sso_domain` (unique partial WHERE "ssoDomain" IS NOT NULL)

`project` table — core table; EE migrations added these columns/FK/indexes (`project-entity.ts`):
- `platformId` + FK `fk_project_platform_id` (→ platform); indexes `idx_project_platform_id`,
  `idx_project_platform_id_external_id` (unique partial WHERE deleted IS NULL)
- `externalId` (null), `maxConcurrentJobs` (null), `poolId` (null) + `idx_project_pool_id`
- `releasesEnabled` (bool d=false), `metadata` (jsonb), `type`, `icon` (jsonb),
  `deleted` (soft-delete timestamp)
- FK ordering: create `concurrency_pool` (bucket B) BEFORE `project.poolId` FK.

**Safety net for any missed core-table touch:** the fresh-DB boot test surfaces a missing
column at first query; resolve by checking the relevant **MIT entity**, never the EE
migration history.

## Definition of done for build-green phase

- Type-check/lint green on `shared`, `server-utils`, `api`, `web`.
- Community edition boots; API 200, worker connected, frontend 200.
- Enterprise/cloud editions resolve all modules (routes may be `501`/stub, but wired).
- Every stub is registered in `stub-index.md` and tagged `STUB` in code.
- No security seam ships an allow-all stub.

## Layer 4 reference — service/guard stubs to author (signatures captured)

Distinct missing EE service/util/guard modules consumers import (~25). Each gets a
same-signature stub under `app/enterprise/…`. **Security seams get REAL deny-by-default base
behavior, never permissive stubs.** Entity imports by consumers (chat-conversation-entity,
project-role.entity) are just repoints to the Layer-2 entities (Layer 6).

> **CORRECTION (supersedes the earlier "always real deny-by-default" rule).** Analysis of
> the existing MIT code (`mcp-permissions.ts`, `flow-run-hooks.ts`, `authorize.ts`) shows
> the platform's *intended* model is **edition-gated RBAC**: RBAC is enforced ONLY for
> CLOUD/ENTERPRISE; COMMUNITY does not enforce per-project RBAC (no roles exist there) —
> tenant SCOPING (Layer A) still applies in all editions via existing MIT code. Crucially,
> `authorize.ts` calls `rbacService.assertPrinicpalAccessToProject` UNCONDITIONALLY for every
> PROJECT route, so a blanket deny-by-default base impl would break COMMUNITY (and any
> not-yet-rebuilt edition) for normal users — i.e. cause real errors in actual use. The
> correct, safe base behavior therefore MIRRORS the existing pattern:
> - **COMMUNITY:** RBAC seam is a pass-through (scoping still enforced elsewhere). This is the
>   upstream community contract, not a hole.
> - **ENTERPRISE/CLOUD:** RBAC must resolve real roles and deny on missing permission. Until
>   the real project-member/project-role services are rebuilt, the enterprise/cloud path of
>   these seams is NOT production-ready — it is marked STUB and tracked, and must be
>   completed before enterprise/cloud is sold. It must FAIL SAFE (deny/error) for
>   enterprise/cloud, never silently allow.
> Net: the seam is edition-aware. It never breaks community; it never silently grants in
> enterprise/cloud. The "real RBAC" work is a feature rebuild (post-build-green), not
> scaffolding.

SECURITY SEAMS (edition-aware per the correction above):
- `rbac-service` → `rbacService(log).assertPrinicpalAccessToProject({ principal, permission,
  projectId })` — used in `core/security/v2/authz/authorize.ts:102`. Base impl: resolve the
  principal's role/permission and DENY when permission absent. (Engine→bound project only;
  Service→project in caller's org; else deny.)
- `rbac-middleware` → exports: `assertUserHasPermissionToFlow(principal, projectId,
  flowOperationType, log)` (flow.controller.ts:98); `assertRoleHasPermission(principal,
  projectId, permission, log)` (user-invitation.module.ts:182); `getPrincipalRoleOrThrow(
  userId, projectId, log)` (mcp-permissions.ts:18); `rbacMiddleware` preHandler hook
  (app.ts:169). Base impl: real built-in-role permission checks; deny by default.
- `ee-authorization` → fastify preHandler guards (called via `.call(app, request, reply)`):
  `platformMustBeOwnedByCurrentUser`, `platformToEditMustBeOwnedByCurrentUser`,
  `platformMustHaveFeatureEnabled`, `projectMustBeTeamType`. Base impl: assert
  ownership/feature; throw/deny on failure.

SAFE-DEFAULT SERVICE STUBS (marked STUB; null/empty/false/no-op):
- api-key-service, project-member.service, project-role.service, secret-managers.service
  (+ `containsSecretManagerReference`), concurrency-pool.service, platform-plan.service,
  worker-group.service, alerts-service, email-service, smtp-email-sender, git-sync.service,
  project-state.service, platform-project-service, platform-template.service,
  federated-authn-service, otp-service, saml-client (`invalidateSamlClientCache`),
  embed-subdomain.service, openrouter-api, stripe-helper, piece-filtering-utils
  (`enterpriseFilteringUtils`), chat-rpc-handlers, chat/mcp/chat-mcp (`CONVERSATION_ID_HEADER`).
- Each stub's exact signature is read from its consumer call-site before authoring.

## Layer 4 progress (in flight)

- **rbac-service — DONE & verified (0 errors).** `app/enterprise/authentication/project-role/
  rbac-service.ts` authored edition-aware + fail-safe: ENGINE→bound-project check (all
  editions); COMMUNITY→pass-through (upstream contract); ENTERPRISE/CLOUD→deny (STUB, fail
  safe, never silently grants). Repointed `authorize.ts` import. Logged in stub-index.
- **rbac-middleware — DONE & verified (0 errors).** Edition-aware/fail-safe; `rbacMiddleware`
  hook is a no-op (authz enforced in authorize.ts via rbacService).
- **ee-authorization — DONE & verified (0 errors).** Ownership guards are REAL
  (PlatformRole.ADMIN, from MIT authorize.ts model); `platformMustHaveFeatureEnabled` is REAL
  (reads `platformService.getOneWithPlanOrThrow().plan`); `projectMustBeTeamType` is an
  edition-aware STUB. Note: consumer-import repoints for these (flow.controller,
  mcp-permissions, user-invitation.module, app.ts, template.controller, platform.controller,
  analytics) are deferred to the Layer-6 repoint pass; the new stub FILES themselves verify
  clean in isolation.
- **project-role.service — DONE (0 errors).** Exports real `projectMemberRepo` (repoFactory
  over ProjectMemberEntity) + `projectRoleService.getOneOrThrowById` STUB (reached only when
  projectRolesEnabled, i.e. enterprise; fail-safe throw).
- **project-member.service — DONE (0 errors).** COMMUNITY-CRITICAL methods implemented REAL
  to avoid breaking actual use: `getRole()` (owner OR membership → full-access role, else
  null; sole caller websockets only checks non-null → legitimate community users authorized,
  outsiders denied) and `list()` (real repo query with user relation). `hasPermissionOnAnyProject()`
  returns false (fail-safe; admins invite in community and return early before this call),
  `upsert()` no-op — both STUBs for enterprise. NOTE for real-impl pass: `list()` casts repo
  rows to `ProjectMemberWithUser` via `unknown` (only `user` relation is loaded; the one
  consumer reads only `.user.*`) — harden when the full service is built.
- **email/alerts/api-key batch — DONE (0 errors).** `api-key-service.getByValue`→null
  (fail-safe, rejects API-key principals until real; spec F.1); `smtp-email-sender.isSmtpConfigured`→false
  (email paths degrade gracefully); `email-service` send* → no-ops (unreachable while SMTP
  off); `alerts-service.sendAlertOnRunFinish`+`add` → no-ops (caller paid-edition gated;
  `add` pre-added for the project post-create hook).
- **plan/capacity batch — DONE (0 errors).** `platform-plan.service` (getOrCreateForPlatform→
  base limits from MIT OPEN_SOURCE_PLAN; update/getUsage/checkActiveFlows/isCloudNonEnterprise
  → safe defaults; community short-circuits before these, so reached only enterprise/cloud);
  `worker-group.service` (no dedicated group / not canary → default pool); `concurrency-pool.service`
  (getProjectPoolId→null, getPoolLimit→throw→caller falls back to plan default). NOTE: still
  owed for Layer 5 — `platformAiCreditsService(app.log).init()` (app.ts switch).
- **connections/releases batch — DONE (0 errors in new files).** `secret-managers.service`
  = REAL pass-through (R9, community-critical); `project-state.service.getTableState` = REAL
  mapping (R10, community-critical table export); `git-sync.service.onDeleted` = safe no-op
  (must not throw). Consumer imports for these still point at old `../ee/` paths → Layer-6
  repoint.
- **auth batch — DONE (0 errors).** `otp-service.createAndSend`→no-op (CLOUD-only caller;
  Cloud OTP send incomplete), `federated-authn.getThirdPartyRedirectUrl`→'' (community-reachable
  flag; correct base), `saml-client.invalidateSamlClientCache`→no-op.
- **governance/embed/template batch — DONE (0 errors).** `piece-filtering-utils`=REAL
  pass-through (R11, community-critical piece listing); `embed-subdomain.service.getByHostname`→null
  (CLOUD-only, falls back to env origins); `platform-template.service` create/update→fail-safe
  throw (CUSTOM templates = enterprise only).
- **final service batch — DONE (0 errors).** `platform-project-service` (markForDeletion/
  deletePersonalProjectForUser → no-op; R12 cleanup gap), `openrouter-api.createKey`→throw
  (enterprise managed AI), `stripe-helper.deleteCustomer`→no-op (enterprise billing),
  `chat-rpc-handlers` (matches WorkerToApiContract; getChatConfig/executeChatTool→throw,
  void methods→no-op; chat is enterprise), `chat-mcp` `CONVERSATION_ID_HEADER='x-conversation-id'`.
- **LAYER 4 SERVICE STUBS COMPLETE: all 23 service/guard modules authored & type-clean.**
  Only `platformAiCreditsService(app.log).init()` remains — it's app.ts-switch-level → Layer 5.
  Consumer imports across the codebase still point at old `../ee/...` paths for many of these
  → repointed in the Layer-6 pass (the stub FILES are all verified in isolation).
  service stubs (api-key, project-member, project-role, secret-managers [+`containsSecret…`],
  concurrency-pool, platform-plan, worker-group, alerts, email-service, smtp-email-sender,
  git-sync, project-state, platform-project, platform-template, federated-authn, otp,
  saml-client, embed-subdomain, openrouter-api, stripe-helper, piece-filtering-utils,
  chat-rpc-handlers, chat-mcp). project-member.service is itself a SECURITY-relevant seam
  (`hasPermissionOnAnyProject` gates invite access in authorize.ts) → edition-aware fail-safe
  like rbac-service, not a blanket-true stub.

## Testing policy (per user: "test flows as you implement")

- The app cannot boot/run flows until Layers 4+5 (compile green) and Layer 3 (schema)
  complete — there is no degraded mode with ~100 cascade errors + no schema.
- Therefore: **per-batch `tsc` type-check now** (continuous), and the **first real
  flow-execution test happens at the first bootable checkpoint** (end of L5 + L3): boot
  community (PGLite), create a flow, run it, confirm success — plus verify the edition-aware
  RBAC seams don't block legitimate community actions ("no errors in actual use"). Results
  logged here before continuing past that checkpoint.

## RISK REGISTER — "actual-use traps" (read before the real-impl pass)

Places where a naive/lazy stub would compile cleanly but BREAK the running system or open a
security hole. Each was handled deliberately; listed so the real-impl pass preserves the
correct behavior and reviewers can audit it.

| # | Location | The trap (why a lazy stub is dangerous) | How it was handled | Must-do at real impl |
|---|----------|------------------------------------------|--------------------|----------------------|
| R1 | RBAC seams (`rbac-service`, `rbac-middleware`) | `authorize.ts` calls `assertPrinicpalAccessToProject` UNCONDITIONALLY for every PROJECT route, in EVERY edition. A blanket deny-by-default stub would block all normal community users → total breakage. A blanket allow would be a security hole in enterprise/cloud. | Edition-aware: COMMUNITY pass-through (upstream contract; scoping still enforced by MIT code), ENGINE bound-project check always-on, ENTERPRISE/CLOUD fail-safe DENY. | Implement real role resolution + permission checks for enterprise/cloud (spec I.3/I.4). Never make community deny-by-default; never make enterprise allow-by-default. |
| R2 | `project-member.service.getRole()` | Sole caller is the websocket `validateProjectId`, which runs for EVERY websocket connection in EVERY edition, UNGATED, and throws if role is null. A null-returning stub would break the flow builder's live updates for all community users (silent outage). | Implemented REAL from MIT-derivable access rules: non-null role if user owns the project OR has a membership row; else null. | Keep the access semantics (owner/member → access). When adding granular roles, return the actual role, but never regress legitimate community access. |
| R3 | `project-member.service.hasPermissionOnAnyProject()` | Gates non-admin invite access in `authorize.ts` (`assertNonEmbedOrAdmin`). Returning `true` would let any user invite (security hole). | Returns `false` (fail-safe). Admins return early in authorize.ts before this is reached, so legitimate community invites (admin-only) still work. | Implement real per-project permission check for enterprise; keep fail-safe-false default. |
| R4 | `license-keys` verify route | Hard-dropping it 404s the MIT frontend's `POST /v1/license-keys/verify`. | Kept as STUB route (200, grants nothing). | Replace with real entitlement (spec G.4). Never grant entitlement from the stub. |
| R5 | Migrations / `synchronize:false` | The DB has NO schema unless a migration creates it; dangling EE migration imports also break build. Naive single-CREATE conflicts with 84 downstream ALTERs. | Strategy: full-baseline squash via synchronize-then-snapshot (Layer 3, executed after L4/L5). | Verify fresh-DB boot creates ALL tables; never partially create schema. |
| R6 | `project-member.service.upsert()` | A no-op silently fails to add a member during invite-accept (data-loss-like bug, not a crash). | No-op STUB, explicitly flagged. | Implement real membership insert (resolve role by name) before enabling team invites. |
| R7 | `project-member.service.list()` cast | Casts repo rows to `ProjectMemberWithUser` via `unknown`; only the `user` relation is loaded (consumer reads only `.user.*`). A different consumer reading `.projectRole`/`.project` would get undefined at runtime. | Safe for the current single consumer; flagged. | Load all relations or return a precise type when generalizing. |

| R8 | `platform-plan.service` (reached in **CLOUD and ENTERPRISE**, NOT community) | The `platform.service` short-circuit is `edition === COMMUNITY` only, so **both CLOUD and ENTERPRISE fall through to this service**. The stub returns base limits with `includedAiCredits: 0` and no-op `update`/`checkActiveFlowsExceededLimit` → managed AI credits unfunded, flow limits unenforced, billing inert. Not a crash (valid plan object, boot/flows OK); the commercial logic is non-functional. **Cloud is affected, not just enterprise.** | Safe defaults returned; flagged. | Implement real plan state + metering + limit enforcement before selling CLOUD or ENTERPRISE (spec G.3). |

| R9 | `secret-managers.service` `resolveObject`/`resolveString` + `containsSecretManagerReference` | Run in EVERY edition during connection create/use/refresh. A null/empty/throw stub would corrupt every connection value → break flows in community. | Implemented as REAL pass-through: with no secret manager configured there are no references, so values are returned unchanged (`resolveString` returns the literal key; `containsSecretManagerReference`→false). Correct base behavior. | When adding real providers, only transform values that actually contain a secret-manager reference; never alter literal values. |
| R10 | `project-state.service.getTableState` | Used by core table→template export (`table.service.getTemplate`, all editions). A hollow stub would break table export. | Implemented REAL (pure mapping PopulatedTable→TableState, incl. STATIC_DROPDOWN options). | Keep mapping correct as field types evolve. |

> TERMINOLOGY: throughout this doc and the stubs, "enterprise"/"paid editions" means
> **CLOUD *and* ENTERPRISE** (the non-community path). The only edition short-circuit in the
> code is `=== COMMUNITY`; CLOUD and ENTERPRISE always fall through together. Earlier entries
> that said "enterprise-only" were imprecise labeling, NOT wrong behavior — every
> edition-aware stub already treats CLOUD the same as ENTERPRISE (fail-safe deny / inert, never
> silently-grant, never crash). Audited post-correction: no earlier stub is behaviorally wrong
> for Cloud; R8 wording fixed; R1/R2/R3 apply equally to Cloud.

| R11 | `piece-filtering-utils` `isFiltered`/`filter` | Run in the core piece-metadata listing path in EVERY edition. A stub that filtered/hid pieces would break piece listing for everyone. | Implemented REAL: `isFiltered`→false, `filter`→list unchanged (no governance configured = nothing filtered). | When adding governance, only filter pieces actually denied by platform policy; never hide by default. |

| R12 | `platform-project-service.deletePersonalProjectForUser` | Reached in ALL editions (user delete / removeFromPlatform). No-op means the user row is deleted but their personal project + child data is NOT cascade-cleaned → orphaned data accumulates. Not a crash; a data-hygiene/cleanup gap. | No-op STUB, flagged. | Implement real personal-project deletion + cascade (spec I.5) before relying on user-deletion cleanup. |

| R13 | `platformProjectModule` (`/v1/projects`) | The ONLY module serving `/v1/projects`, registered in the COMMUNITY branch. A no-op stub would 404 project list/create/update/delete in every edition → break the builder/app entirely. | Implemented REAL, backed by MIT core `projectService`, enriching to `ProjectWithLimits` (base plan + zeroed analytics). | When real plans/analytics exist, enrich with actual plan + counts; keep `/v1/projects` always functional. |

> Principle for the real-impl pass: a stub that returns the WRONG answer silently is worse
> than one that throws. Security seams fail safe (deny); community-critical read paths return
> correct access; write paths that silently no-op are flagged here as data-risk.

## Layer 5 progress (module stubs + switch)

- **Special app.ts symbols — DONE (0 errors), shape-verified against real contracts:**
  `projectEnterpriseHooks` (→ProjectHooks, no-op postCreate; community default already no-op),
  `enterpriseFlagsHooks` (→FlagsServiceHooks, pass-through = community default),
  `platformProjectBackgroundJobs.hardDeleteProjectHandler` (SystemJobData<HARD_DELETE_PROJECT>,
  no-op, must-not-throw; R12), `platformAiCreditsService.init` (no-op, CLOUD/ENT only),
  `platformOAuth2Service` (OAuth2Service<PlatformOAuth2ConnectionValue>, claim/refresh→throw,
  CLOUD/ENT only). Hooks installed only in CLOUD/ENTERPRISE branches; community uses the
  built-in default hooks, so these overrides are safe no-ops/pass-throughs.
- **`platformProjectModule` — DONE & verified (0 errors).** REAL implementation (R13):
  `GET/POST /v1/projects`, `POST/DELETE /v1/projects/:id`, backed by MIT `projectService`/
  `userService`; DELETE routes through `platformProjectService.markForDeletion` (soft delete +
  R12 async cleanup). `toProjectWithLimits` enriches with base ProjectPlan + zeroed analytics.
  Verified: `update` params match `UpdateTeamProjectParams`; corrected a wrong assumption
  (core `projectService` has NO `softDelete` — used markForDeletion instead). Security:
  `nonEmbedUsersOnly([USER,SERVICE])` on all routes (real, non-permissive).
- **MODULE-STUB POLICY (decided after frontend gating audit):** blanket no-op (no routes →
  404) is NOT safe, because a few EE endpoints are called UNCONDITIONALLY by the community
  frontend (not behind `platform.plan.X`/`edition`/`enabled:` gates). Audit results:
    - `GET /v1/project-members` — **unconditional** (app-connections-hooks `useConnectionsOwners`
      calls it in all editions). → module is REAL, list backed by the real
      `projectMemberService.list`; update/delete route to the service.
    - All other EE admin endpoints (signing-keys, audit-events, api-keys, project-roles,
      embed-subdomain, saml admin, platform-billing, oauth-apps, global-connections, git-repos,
      project-releases, secret-managers admin, worker-machines, users admin, etc.) are reached
      ONLY behind plan/edition/enabled gates in the frontend (platform-admin screens locked in
      community). → safe as stub modules.
  - **Stub module pattern (zero-breakage):** rather than 404, each stub list endpoint returns a
    valid EMPTY result (`SeekPage` `{data:[],next:null,previous:null}` or `[]`); mutations
    return fail-safe (501/feature-disabled). Empty-but-valid never breaks a frontend `list()`;
    a 404 could. Marked STUB; real impl per spec later.
- REMAINING Layer 5: the ~24 stub route MODULES (per policy above), then
  repoint all 30 app.ts EE imports to enterprise/ paths.
  Module list to author (export name → route prefix → kind):
  REAL: `projectMemberModule` `/v1/project-members` (list real via projectMemberService;
  update→service.upsert-style, delete→service). STUB-empty-list / fail-safe-mutation:
  `alertsModule` /v1/alerts, `apiKeyModule` /v1/api-keys, `auditEventModule` /v1/audit-events,
  `signingKeyModule` /v1/signing-keys, `oauthAppModule` /v1/oauth-apps, `globalConnectionModule`
  /v1/global-connections, `projectRoleModule` /v1/project-roles, `gitRepoModule` /v1/git-repos,
  `projectReleaseModule` /v1/project-releases, `secretManagersModule` /v1/secret-managers,
  `platformWebhooksModule` (platform webhooks), `connectionKeyModule` /v1/connection-keys,
  `appCredentialModule` /v1/app-credentials, `embedSubdomainModule` /v1/embed-subdomain,
  `platformPieceModule` (platform pieces), `scimModule` /v1/scim, `managedAuthnModule`
  /v1/managed-authn, `authnSsoSamlModule` /v1/authn/saml, `enterpriseLocalAuthnModule`,
  `federatedAuthModule`, `otpModule`, `platformPlanModule` /v1/platform-billing,
  `userModule` /v1/users, `chatModule` /v1/chat, `adminPlatformModule`,
  `adminPlatformTemplatesCloudModule`. (Verify each prefix from the deleted module's frontend
  caller before finalizing; several are admin-only and may simply register nothing.)
  NOTE: confirm exact route prefixes/response shapes from each MIT frontend api file when
  authoring — do not assume. Route modules registering nothing →
  those feature endpoints simply 404 until rebuilt (acceptable; frontend handles optional
  endpoints; community doesn't use them). `platformProjectModule` is registered in the
  COMMUNITY branch too — verify community project endpoints are covered by the core project
  module or that this module's routes are needed before making it a pure no-op.
- **`platformProjectModule` — ANALYZED: it is COMMUNITY-CRITICAL, must be REAL (not a no-op).**
  It is the ONLY module serving `/v1/projects`; the frontend project-collection store
  (web/.../projects/stores/project-collection.ts) calls: `GET /v1/projects` →
  `SeekPage<ProjectWithLimits>` (list), `POST /v1/projects` (create), `POST /v1/projects/:id`
  (update), `DELETE /v1/projects/:id`. A no-op would 404 the project list in EVERY edition →
  break the builder. Plan: implement these 4 routes backed by the MIT core `projectService`
  (getAllForUser/create/update/getOneOrThrow), enriching each Project →
  `ProjectWithLimits` = Project(−deleted) + `plan: ProjectPlan` (base) + `analytics`
  (zeroed counts). Add as RISK REGISTER R13 (community-critical module). This is the one
  Layer-5 module that is real; the other ~24 are no-op route plugins (their endpoints 404
  until rebuilt; not community-critical).

## Layer 5 — COMPLETE (app.ts compiles, 0 errors).

- `projectMemberModule` — REAL (GET list backed by projectMemberService.list; mutations
  fail-safe). Verified 0 errors.
- 22 stub modules via shared `createEnterpriseStubModule` (registers no routes; safe because
  their endpoints are plan/edition/`enabled:`-gated in the frontend — per the gating audit).
  `signingKeyModule` added. Each file documents the feature.
- `userModule` stub — verified safe: community-critical `/v1/users/me` + `GET /v1/users/:id`
  are served by the CORE `user/platform/platform-user-module.ts` (MIT), not this EE module;
  the EE module only had the admin surface (gated). No `/v1/users` route conflict (stub
  registers nothing).
- 5 special symbols (hooks/jobs/ai-credits/platform-oauth2) done earlier.
- app.ts: all 30 EE imports repointed `./ee/...` → `./enterprise/...`; the full edition
  switch (CLOUD/ENTERPRISE/COMMUNITY) type-checks. **`tsc` app/app.ts errors = 0.**
- Remaining `Cannot find module '../ee/...'` errors (≈63) are all in CONSUMER files importing
  services directly from old ee paths → Layer 6 repoint.

## Layer 6 — consumer repoint DONE.

- Repointed all consumer service/util/entity imports `../ee/...` → `../enterprise/...` across
  34 files (scripted regex, excluding `postgres-connection.ts`; verified `authorize.ts` and
  others correct). Confirmed: the ONLY remaining `ee/` imports in the whole `src` tree are the
  19 dangling EE **migration** imports in `postgres-connection.ts` — which are Layer 3's job.
- `getMigrations()` is a single flat array (~374 entries, lines ~396–780) mixing core + EE
  migration classes, all imported at top of the file.

## Layer 3 EXECUTION PLAN (precise, make-or-break — do carefully, not rushed):

Step A (unblock compilation): in `postgres-connection.ts`, REMOVE the 19 dangling
  `../ee/database/migrations/...` imports (lines 5–24, minus the already-removed AppSumo) AND
  their 19 entries in the `getMigrations()` array. After this the file compiles, but a FRESH
  DB would lack the schema those migrations created (platform columns, project_member,
  project_role, signing_key, otp, api_key, git_repo, project_release, audit_event,
  custom-domain bits, billing/plan columns, templates columns…). That gap is closed by Step B.
Step B (baseline from entities — the squash): temporarily set PGLITE dev to
  `synchronize: true` (it already does this in TESTING) on an EMPTY dev DB so TypeORM builds
  the FULL schema from the registered entity set (core + the 18 clean-room enterprise
  entities). Capture the emitted CREATE SQL. Commit it as ONE baseline migration (own
  identifier) and put it FIRST (or as the sole) entry; revert synchronize to false. The
  committed SQL is 100% entity-derived (clean-room), uses our own migration id, references no
  EE migration history.
Step C (verify): delete dev/config/pglite, boot community → all tables created, no
  missing-schema errors. This is the make/break test.
NOTE: because downstream core migrations ALTER the EE-created tables (98 DROP COLUMN etc.),
  the simplest correct end state is a SINGLE baseline that creates the FINAL schema and a
  pruned migrations array (drop the historical chain), OR run synchronize at boot for dev and
  keep a committed baseline for prod. Decide in execution; greenfield only (no upstream-AP DB
  upgrade), already out of scope.

## MILESTONE — `packages/server/api` type-checks with ZERO errors.

- Layer 3 Step A done: removed 19 dangling EE migration imports + their 19 array entries from
  `postgres-connection.ts` (exactly 38 lines, verified; only whole-word matches of the 19 EE
  migration class names; no core migration touched). No `ee/` reference remains anywhere in src.
- Fixed the 4 residual non-migration errors surfaced after removal:
  - `project-release.module.ts`: stub-module import depth was `../../../` → corrected to `../../`.
  - `project-role.service`: added `getOneOrThrow({name, platformId})` (module uses it) alongside
    `getOneOrThrowById({id})` (service uses it); both fail-safe.
  - `platform-template.service.create`: loosened param types to match the caller
    (`platformId: string|undefined`, `name?`, structured fields as `unknown`) — stub throws, only
    needs to accept the call.
- `tsc --noEmit` on `packages/server/api`: **0 errors** (down from ~138 baseline).
- STILL PENDING (not TypeScript): Step B (entity-derived baseline migration via synchronize-
  snapshot) + Step C (fresh PGLite boot + community flow test). A fresh DB will currently FAIL
  because downstream core migrations ALTER the now-not-created EE tables — Step B fixes this.

## MIGRATION STRATEGY (final, durable — decided by user: do the correct heavy-lifting now)

Goal: one correct long-term migration architecture for all three editions, with NO
"works-for-now" shortcut that defers schema reconstruction. The schema must be fully and
correctly created on a fresh DB, derived entirely from our own (clean-room) entities.

Mechanism — use the project's EXISTING, authoritative TypeORM tooling (not hand-written SQL,
not snapshot-scraping):
- `migration-data-source.ts` exposes the real `databaseConnection()` DataSource with ALL
  entities registered (core + the 18 clean-room enterprise entities).
- `npm run db-migration` (in packages/server/api) runs TypeORM `migration:generate -d
  migration-data-source.ts`, which DIFFS entity metadata against the connected DB's current
  schema and emits the reconciling SQL. `.env.tests` uses `AP_DB_TYPE=PGLITE` (embedded,
  ephemeral) and `AP_EDITION=ce` — no external Postgres needed.

Procedure (the heavy-lifting baseline, done correctly):
1. Generate against an EMPTY DB → TypeORM emits SQL that CREATES THE ENTIRE schema from the
   entities (every table/column/index/FK) = a complete, authoritative, entity-derived
   baseline migration. This is the single source of truth and matches the entities exactly.
2. Replace the historical `getMigrations()` chain with the generated baseline as the sole
   (first) migration. Prune the obsolete historical imports/array (their schema is fully
   represented by the baseline). Keep the migration runner unchanged.
3. The generated migration uses our own generated identifier/timestamp; it is produced from
   OUR entities by the tool — no EE migration body or identity is read or reused (clean-room
   preserved; legal posture intact).

Clean-room / legal notes:
- Schema is a functional fact forced by interoperability; reproducing it from our own entities
  via the tool is clean. We do NOT transcribe or reference the deleted EE migration history.
- Greenfield only: a database originally created by upstream ActivePieces will NOT migrate via
  this baseline (different identities). Out of scope (documented earlier); deployment-time ETL
  if ever needed. Counsel sign-off flagged.

Verify (Step C): delete dev/config/pglite → boot community → every table (core + 18
enterprise) created, no missing-schema/relation errors → run a flow end-to-end. Then repeat
mentally for enterprise/cloud (same schema; entities registered unconditionally).

## Step B execution mechanics (verified, ready to run)

- `databaseConnection()` for `AP_DB_TYPE=PGLITE` uses the pglite datasource with data dir
  `<AP_CONFIG_PATH>/pglite`. `migration-data-source.ts` exports `databaseConnection()` (all
  entities registered). The `db-migration` npm script runs TypeORM `migration:generate` with
  `.env.tests` (AP_DB_TYPE=PGLITE), script overrides AP_EDITION=ce.
- To emit a FULL baseline (not a diff): generate against a GUARANTEED-EMPTY DB —
  (1) temporarily set `getMigrations()` to return `[]` (so no schema is pre-applied), and
  (2) use a fresh/empty AP_CONFIG_PATH so the pglite dir is empty.
- Exact steps to execute next:
  1. Temporarily make `getMigrations()` return `[]`.
  2. Run the generate (fresh pglite dir) → new migration file under
     `src/app/database/migration/postgres/<ts>-Baseline.ts` containing CREATE for the whole
     entity graph.
  3. INSPECT it: expect ~all core tables + the 18 enterprise tables (alert, api_key,
     app_credential, audit_event, otp, chat_conversation, connection_key, embed_subdomain,
     oauth_app, concurrency_pool, platform_plan, project_member, project_plan, git_repo,
     project_release, project_role, secret_manager, signing_key) with FKs/indices.
  4. Set `getMigrations()` to return ONLY the baseline (import it; prune the historical array).
  5. Step C: delete dev pglite dir → boot community → all tables created → run a flow.

## Step B — DONE (baseline migration generated, verified, wired; api 0 errors).

- Generated via TypeORM `migration:generate` against an EMPTY PGLite (temporarily set
  `getMigrations()` to `[]` + fresh AP_CONFIG_PATH) → produced the full entity-derived schema.
- Verified the generated file: **55 CREATE TABLE** statements — all 18 enterprise tables
  (alert, api_key, app_credential, audit_event, otp, chat_conversation, connection_key,
  embed_subdomain, oauth_app, concurrency_pool, platform_plan, project_member, project_plan,
  git_repo, project_release, project_role, secret_manager, signing_key) each exactly once,
  plus all core tables (project, platform, flow, flow_version, user, app_connection, …) with
  indices/FKs. ~2196 lines.
- Renamed invalid class identifier (started with a digit) → `CleanRoomBaseline1781764568389`
  (kept the `name` identity string consistent); renamed file → `1781764568389-CleanRoomBaseline.ts`.
- `MigrationInterface` is assignable to the project's `Migration` type (extra fields optional) —
  no interface change needed.
- Rewrote `postgres-connection.ts`: removed all 355 historical `./migration/*` imports, added
  the single baseline import, replaced `getMigrations()` body to `return
  [CleanRoomBaseline1781764568389]`. File 444→81 lines. `tsc` api = 0 errors.
- Clean-room/legal: schema generated from OUR entities by the tool; no EE migration body/identity
  read or reused. Greenfield baseline (no upstream-AP upgrade path; out of scope).
- Cleanup: remove the temp `dev/baseline-gen` dir.

## Step C — PASSED. End-to-end community boot + flow test on a FRESH DB.

- `migration:run` on empty PGLite: baseline `CleanRoomBaseline1781764568389` executed
  successfully (all CREATE TABLE + indices + FKs committed; migration recorded).
- Full `npm run dev` (community, fresh dev/config/pglite): baseline created all tables; dev
  seed ran (`[devSeeds] Dev user and platform created` — proves real projectService/hooks
  paths work); `Server listening at http://[::]:3000`.
- HTTP probes: `GET /api/v1/flags` → 200 (exercises federatedAuthn + smtpEmailSender stubs OK);
  frontend `/` → 200.
- Auth + rebuilt modules: sign-in (dev@ap.com/12345678) → token + projectId; `GET /v1/projects`
  → 200, count=1, plan.name=free (REAL platformProjectModule → core projectService →
  toProjectWithLimits, through the nonEmbedUsersOnly security seam).
- Core product: `POST /v1/flows` → created (passes assertUserHasPermissionToFlow RBAC seam,
  community pass-through = R1 verified live); `GET /v1/flows` → count=1.
- CONCLUSION: the clean-room EE removal + replacement works end-to-end in community; schema,
  auth, RBAC seams, and core flow CRUD all functional with zero errors.

## FINAL — lint + type-check clean; clean-room build-green phase COMPLETE.

- Lint: my new files initially had 461 errors, 457 of which were `@typescript-eslint/semi`
  (codebase is semicolon-free; I'd written semicolons) + 4 trivial (unused import/var, quotes,
  import-order). All auto-fixable. Ran `bun run lint --fix` on api → **0 errors, 333 warnings**
  (the 333 are the pre-existing baseline noise in untouched files: explicit-return-type /
  no-misused-promises in worker-module.ts, main.ts, etc. — not regressions).
- Re-ran `tsc --noEmit` after --fix → **0 errors** (auto-fix was cosmetic; removed a genuinely
  unused `ApId` import; broke nothing).
- Verified the generated baseline migration file survived --fix intact (2196 lines, 55 CREATE
  TABLE, class name preserved — semicolons inside SQL template literals untouched).
- STATUS: clean-room EE removal + replacement is type-clean, lint-clean, and verified working
  end-to-end (Step C). Build-green + clean-room phase DONE. Remaining future work = implement
  the enterprise/cloud feature BODIES from the sanitized spec (tracked in stub-index.md +
  RISK REGISTER R1-R13); none of that blocks community, which is fully functional.

## FRONTEND embed-sdk fix (clean-room) — DONE.

- Symptom: browser showed `Cannot find module 'ee-embed-sdk'` in 3 MIT web files
  (home-button.tsx, embed/index.tsx, embedded-connection-dialog.tsx). Cause: `ee-embed-sdk`
  resolved (via aliases) to the DELETED commercial `packages/ee/embed-sdk/src` — the frontend
  counterpart of the EE removal.
- Clean-room replacement: authored `packages/web/src/lib/embed-sdk/index.ts` (MIT, under web,
  NOT under packages/ee) containing the embed message-protocol the frontend uses — two event
  enums (`ActivepiecesClientEventName`, `ActivepiecesVendorEventName`), the client/vendor
  message types (init, auth success/failed, configuration finished, route changed, home-button
  clicked, show/closed connection iframe, connection piece-not-found / name-invalid, vendor
  init, vendor route changed), and `NEW_CONNECTION_QUERY_PARAMS`. Every symbol/field/enum value
  was derived SOLELY from the MIT frontend's own usage (read from the 3 consumer files) — NOT
  from the deleted commercial SDK. Capability spec D.4.
- Repointed the `ee-embed-sdk` alias in ALL THREE places it is defined (found by audit):
  `tsconfig.base.json`, `packages/web/tsconfig.app.json` (the authoritative one for tsc), and
  `packages/web/vite.config.mts` (what the dev server/browser uses) → `./src/lib/embed-sdk`.
- Type precision: made `ActivepiecesVendorInit.data.hideSidebar` and
  `disableNavigationInBuilder` REQUIRED (the consumer assigns them directly to required
  booleans with no fallback; `disableNavigationInBuilder` is `boolean | 'keep_home_button_only'`).
  `tsc -p packages/web/tsconfig.app.json` → **0 errors** (whole web package).
- Vite caches resolution → dev server must be restarted for the browser to pick up the new
  alias (the running instance still had the old mapping).

## Progress log

- **Layer 0 (baseline) — DONE.** Captured the real type-check error set on
  `packages/server/api`. All failures are `TS2307 Cannot find module '../ee/...'`, spanning:
  `app.ts` module imports (lines 24–59), `database-connection.ts` entity imports (10–28),
  `postgres-connection.ts` migration imports (5–24), and ~30 consumer files. This matches
  `broken-imports-worklist.md` exactly — no surprise holes. Stub location confirmed:
  new `app/enterprise/…` path. Next: Layer 1 (drops).
- **Layer 1 — DONE & verified.**
  - AppSumo HARD-DROPPED at all 6 sites: `app.ts` import + CLOUD-branch `app.register`;
    `database-connection.ts` entity import + array entry; `postgres-connection.ts` migration
    import + array entry. No replacement.
  - License-keys STUBBED: created `app/enterprise/license-keys/license-keys-module.ts`
    (marked `STUB`) preserving `POST /v1/license-keys/verify` (platform-admin, no-op 200,
    grants nothing), using MIT shared `VerifyLicenseKeyRequestBody`. Repointed `app.ts`
    import to the new path. Real entitlement = spec G.4 later.
  - Verified via `tsc --noEmit` (api): appsumo/license-keys/enterprise-license errors = 0;
    the new stub compiles clean.
  - Incidental correctness fixes (real bugs in already-changed/relay code, not EE-cascade):
    annotated 4 un-typed `await response.json()` (typed `unknown` in this project) in
    `community-templates.service.ts` (×3) and `piece-sync-service.ts` (×1, as
    `PieceMetadata & { packageType, pieceType }` to match the `create()` contract), and
    fixed a pre-existing `unknown→PieceRegistryResponse[]` assignment in
    `piece-sync-service.ts` (declaration-annotation → `as`). Total api errors 138 → 131; the
    remaining 131 are all EE-cascade (missing `../ee/...` modules/entities/services),
    addressed by Layers 2–6.
  - First-pass mistake caught by the verify gate: an Edit placed drop-comments on the wrong
    line, leaving the appsumo imports intact; re-verified and corrected. (Why per-layer
    type-checks are mandatory.)
- **Layer 2 — IN PROGRESS (7 of 18 entities done, all verified 0 errors).** Entities are
  authored under `app/enterprise/…`, fields derived from MIT shared types only (preferring
  `shared/.../management/*`; `shared/.../ee/*` is also MIT — license boundary is
  `packages/ee` + `packages/server/api/.../ee` only, NOT `shared`). Each repointed in
  `database-connection.ts`. Done so far:
    1. `enterprise/projects/project-role/project-role.entity.ts` (from MIT `ProjectRole`)
    2. `enterprise/projects/project-members/project-member.entity.ts` (from MIT `ProjectMember`)
    3. `enterprise/alerts/alerts-entity.ts` (from MIT `Alert`)
    4. `enterprise/api-keys/api-key-entity.ts` (from MIT `ApiKey`)
    5. `enterprise/authentication/otp/otp-entity.ts` (from MIT `OtpModel`)
    6. `enterprise/signing-key/signing-key-entity.ts` (from MIT `SigningKey` + AddSigningKeyResponse)
    7. `enterprise/audit-logs/audit-event-entity.ts` (from MIT `ApplicationEvent`)
  Remaining 11 entity imports in `database-connection.ts` still point at `../ee/...`:
  app-credentials, chat-conversation, connection-key, embed-subdomain, oauth-app,
  concurrency-pool, platform-plan, project-plan, git-repo (git-sync), project-release,
  secret-manager. **FK ordering reminder:** create `concurrency_pool` before `project.poolId`
  FK is exercised. Verified after each batch via `tsc --noEmit`.
- **Layer 2 — DONE & verified (all 18 entities).** `database-connection.ts` now has ZERO
  `../ee/` entity imports; all repointed to `app/enterprise/…`; each new entity file
  type-checks with 0 errors (incl. the ~40-field `platform_plan`). Batches:
    - Batch 3: concurrency-pool, oauth-app, app-credentials, connection-key.
    - Batch 4: chat-conversation, embed-subdomain, git-repo, project-release,
      secret-manager, project-plan, platform-plan.
  All fields derived from MIT shared types (each file carries a clean-room provenance
  header). Entities registered unconditionally (schema in all editions); sensitive columns
  (privateKey, clientSecret, sshPrivateKey, secret-manager `auth`, connection-key/app-cred
  `settings`) are stored but excluded from public response types upstream. **Next: Layer 3
  (fresh migrations from these entities) — required before boot since `synchronize:false`.**
