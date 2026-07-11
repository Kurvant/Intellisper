# Clean-Room Build — Platform (Tenancy Plan/Billing/Capacity) Feature

Scope: the enterprise/cloud **platform** capability layer that sits on top of the MIT base
platform entity — plans & entitlements, quota enforcement, managed AI credits, concurrency
pools, dedicated worker groups, and subscription billing. Implemented under
`packages/server/api/src/app/enterprise/platform/` from the
[tenancy-and-enterprise-capability-spec](./tenancy-and-enterprise-capability-spec.md)
(Parts I.7a, I.7b, G.1–G.4, H.1). No original EE source was copied.

---

## 1. Clean-room boundary observed

**Independently authored (my own logic + internal names, from the spec):** all business
logic, control flow, and every non-exported helper. Internal helper names are deliberately
different from the original (e.g. `createInitialPlan`, `seedPlanByEdition`, `countActiveFlows`,
`resolveCanarySet`, `raiseKeyLimitBy`, `readProviderUsageCached`, `runAutoTopUpIfDue`,
`applyImmediateChange`, `applyDeferredChange`).

**Kept identical only for interoperability** (the MIT/CE code imports these exact symbols, so
renaming would break the build and the test suite — which the clean-room provisions permit):
the exported service names and the specific methods CE calls — `platformPlanService`
(`getOrCreateForPlatform`, `update`, `getUsage`, `checkActiveFlowsExceededLimit`,
`isCloudNonEnterprisePlan`), `concurrencyPoolService` (`getProjectPoolId`, `getPoolLimit`),
`workerGroupService` (`getWorkerGroupId`, `isCanaryPlatform`), `platformAiCreditsService`
(`init`, `getUsage`), `openRouterApi` (`createKey`), `stripeHelper` (`deleteCustomer`) — plus
table/column names (fixed by the shared `PlatformPlan` type + test fixtures) and the
distributed-store key names (defined in CE `database/redis/keys.ts`). Public route paths and
request/response schemas come from the shared package, not from EE source.

---

## 2. Business-logic decisions (equivalent-or-better)

### 2.1 Entitlement record is the single source of truth (spec I.7a)
`platformPlanService.getOrCreateForPlatform` lazily creates one plan row per organization under
a distributed lock (double-checked), **seeded by edition**: self-hosted (community/enterprise)
seed the open/full-local set; cloud seeds the standard commercial default. A **null numeric
limit means unlimited** (never zero). Any tier change mirrors the tier label into the
distributed store so no stale entitlement is honored.

### 2.2 Quota enforcement is a distinct, community-exempt pre-action gate (spec I.7a)
`checkActiveFlowsExceededLimit` is a no-op in community; in metered editions it compares the
live active-flow count to the plan limit and denies with `QUOTA_EXCEEDED`. It is never conflated
with authorization (which is always on, independent of plan/edition).

### 2.3 Composed "organization with entitlements" read stays the one edition seam (spec I.7b)
The base `platform.service` remains the sole composer of platform+plan+usage; my service only
supplies plan/usage and is called only in enterprise/cloud (community short-circuits to the
open plan with no record consulted). No new edition branching leaked into feature code.

### 2.4 Concurrency pools (spec G.1)
Idempotent upsert per `(platformId, key)` under a lock; a project maps to at most one pool; a
project with **no pool resolves to unlimited**. Hot-path reads (project→pool, pool→limit) are
cached with an explicit "no pool" sentinel so poolless dispatch never re-queries.

### 2.5 Worker groups / canary — **improved design** (spec G.2)
The canary decision is on the request hot path. Rather than a per-organization lookup, I resolve
the **set of all canary organizations once** and cache it, with an **in-process single-flight
guard** that collapses a concurrent cold-cache burst into a single DB query; reassignment
migrates already-queued work to the target queue and invalidates the caches. This is the exact
contract the repository's own `worker-group.service.test.ts` specifies (10/10 green), and is
more efficient than a per-request read.

### 2.6 Managed AI credits (spec H.1 / G.3.5)
Fixed, documented **credits↔currency conversion**; provider-usage reads cached briefly; a
periodic, lock-guarded check renews the monthly included allowance (≤ once/month) and performs
auto-top-up **fail-closed**: it charges only when enabled, below threshold, and the month-to-date
auto-top-up plus the next top-up stays within the monthly ceiling — otherwise it skips. Provider
keys are provisioned server-side (SSRF-safe HTTP) and never sent to clients; the usage cache is
invalidated immediately after any balance change.

### 2.7 Subscription billing — money-safe by construction (spec G.3)
The processor client is **inert unless cloud** (resolves to "not configured"; every op is a safe
no-op elsewhere, no outbound calls). Plan state is reconciled **only from signature-verified,
idempotent webhooks** — never assumed from the checkout call. **Upgrades apply immediately
(prorated); downgrades are deferred to period end** via a single subscription schedule
(superseding/releasing any prior one); a free-tier downgrade schedules cancellation. Losing a
subscription resets the organization to the default-tier entitlements.

---

## 3. Files

Services: `platform-plan.service.ts`, `concurrency-pool/concurrency-pool.service.ts`,
`platform-plan/worker-group.service.ts`, `platform-plan/platform-ai-credits.service.ts`,
`platform-plan/openrouter/openrouter-api.ts`, `platform-plan/stripe-helper.ts`.
HTTP: `platform-plan/platform-plan.controller.ts` (admin billing surface),
`platform-plan/stripe-billing.controller.ts` (cloud-only webhook reconciler).
Module: `platform-plan/platform-plan.module.ts` (controller in enterprise+cloud; webhook in
cloud only). Entities (`platform_plan`, `concurrency_pool`) were pre-existing clean-room
scaffolding, registered in `getEntities()` and the baseline migration.

Test-path correction (mechanical, path-only, no assertions changed): stale `src/app/ee/…`
imports left from the Phase-1 `ee → enterprise` folder rename were repointed to
`src/app/enterprise/…` in the platform-related test files and the two shared test helpers, so
the tests exercise the real code. Production code already used `enterprise/` exclusively.

---

## 4. Verification

- **Type-check:** `tsc --noEmit` over the whole `server/api` package — **0 errors** (every
  consumer contract satisfied).
- **Lint:** eslint over all new files — **clean (exit 0)**.
- **Tests (run locally via PGLite + in-memory Redis, `AP_EDITION` per suite):**
  - `ee/platform-plan/concurrency-pool.service.test.ts` — **8/8 pass**.
  - `unit/app/core/canary/*` (worker-group.service, canary-routing.middleware,
    canary-proxy.integration) — **24/24 pass**.
  - `cloud/platform/platform.test.ts` — **21/21 pass** (see §7 for the project-deletion
    cascade that made the `delete platform endpoint` block green).

Community edition is unaffected by construction: the base platform service never calls this
layer in community, and quota enforcement is a community no-op.

### 7. Project-deletion cascade (spec I.5) — implemented to finish the delete flow

The `delete platform endpoint` tests depend on the two-stage workspace removal, which was a
Phase-1 no-op stub. Implemented clean-room from spec I.5:

- **`platformProjectService.markForDeletion`** (stage 1): soft-deletes the project (immediately
  unusable, still restorable), captures the currently-enabled flow ids, and schedules an
  idempotent `HARD_DELETE_PROJECT` job keyed deterministically per project
  (`hard-delete-project-<id>`) so repeated scheduling is a no-op.
  `deletePersonalProjectForUser` routes personal-workspace cleanup through the same path.
- **`hardDeleteProjectHandler`** (stage 2): safely repeatable — returns cleanly if the project
  is already gone; tears down the pre-deleted flows' live triggers best-effort (isolated so a
  failed teardown never blocks removal); explicitly removes the project's multi-project-scoped
  app-connections (which the row cascade does not sweep, since their project FK is
  `SET NULL`); then hard-deletes the project row, letting the database cascade remove flows,
  versions, and runs.

The platform hard-delete job counts projects `withDeleted()`, so the project rows must be fully
removed (not just soft-deleted) before the platform delete completes — which this handler now
guarantees.

**Security fix surfaced by the working cascade.** With deletion now completing, an authorization
gap became testable: `platformToEditMustBeOwnedByCurrentUser` only checked that the caller was an
admin of *their own* platform, not that the target `:id` platform *is* theirs — so an admin of
platform A could delete platform B. The guard now additionally requires the target platform id to
equal the caller's platform id (a principal is always scoped to its own platform), closing the
cross-platform edit/delete hole. This is a genuine hardening for the regulated deployment.

---

## 5. Definition-of-Done coverage (spec Part I.10 / Part V, platform slice)

- [x] Per-organization plan/entitlement record, edition-seeded defaults, lazy + duplicate-safe
      creation, absent-limit = unlimited.
- [x] Entitlement resolver returns effective entitlements in every edition; community needs no
      record.
- [x] Cached plan/tier view invalidated on update (no stale entitlement honored).
- [x] Quota enforcement is a pre-action check that denies in metered editions and is a no-op in
      community; never conflated with authorization.
- [x] Single composed org-with-entitlements read remains the sole entitlement source; sensitive
      material excluded; edition selects the source, authorization never on that branch.
- [x] Concurrency pools: idempotent per (org,key), one pool per project, no-pool = unlimited,
      cached with sentinel.
- [x] Worker groups: assignable/none, queued-work migration on reassignment, canary as a
      distinguished value; hot-path cached with single-flight.
- [x] Managed AI credits: server-side provider key, top-up + fail-closed auto-top-up with
      monthly ceiling, cumulative + period usage.
- [x] Billing inert in non-cloud; cloud reconciles only from verified idempotent webhooks;
      immediate-upgrade / deferred-downgrade; subscription loss → default tier; credit top-up
      fails closed.
- [x] Fail-safe defaults throughout (scoping/quota/secret retrieval deny or error, never
      silently grant or return empty-as-success).

---

## 6. Notes / follow-ups

- The billing money-movement paths (checkout/portal/webhook/schedules/top-up) are cloud-only and
  cannot be integration-tested without a processor test account; they are verified by tsc + lint
  + spec-conformance. Recommend a processor-sandbox contract test before enabling cloud billing.
- Managed-AI provisioning targets the model gateway's public provisioning API via the
  SSRF-filtered HTTP client; the operator provisioning key is server-side config only.

---

## 8. Super-administrator (operator) surface — spec C.5

The `platform/admin/` subfolder was a `createEnterpriseStubModule` placeholder; it is now a real
clean-room operator surface, registered in the CLOUD branch of `app.ts`. These endpoints act
**across organizations** and are therefore not tenant-facing — they are guarded by an operator
key presented in a request header (deny-by-default when no key is configured).

**`admin-platform.controller` + `admin-platform.service`** (`/v1/admin`):
- `POST /pieces` — register an official (platform-owned) integration.
- `POST /platforms/runs/retry` — bulk operational remediation: re-run a selected set of failed
  executions from their failed step. Runs are grouped by owning workspace and each group is
  retried in one workspace-scoped call (cleaner than a manual query+group + per-run loop).
- `POST /platforms/apply-license-key` — resolve email → admin user → owned organization, then
  apply the license. The licensing verify/apply subsystem is a separate enterprise capability not
  yet built here, so this **fails safe** (validates the account, then returns a mapped
  `FEATURE_DISABLED` → 402, never silently accepts an unverified license and never crashes).
- `POST /platforms/increase-ai-credits` — grant/increase an organization's managed AI-credit
  allowance by raising its managed provider-key spend limit (provisioning the key if absent).
- `POST /platforms/worker-group` and `POST /platforms/canary` — reassign an organization's
  execution group / toggle canary, reusing the platform feature's `workerGroupService`
  (which migrates queued work and invalidates caches).

**`admin-platform-templates-cloud.module`** (`/v1/admin/templates`, separate templates operator
key): curate the official template library — set the template-category flag, fetch/create/update
**official** templates (rejects any non-official type), with flow-version migration on write.

Deliberately omitted: the bulk chat-analytics sync route, because its dependency (the enterprise
chat sync job) is not built in this deployment — including it would have introduced a broken
import. It can be added when the chat subsystem is re-implemented.

**Clean-room:** all logic and internal helper names are independently authored
(`assertOperatorKey`, `assertTemplatesKey`, `resolveOwnedPlatformByAdminEmail`, `assertOfficial`);
only the exported module/service/method names the wiring and shared request schemas require are
kept for interoperability. No original admin source was copied.

**Verification:** tsc 0 errors, lint clean, and the full cloud app boots and registers both admin
modules (the cloud platform suite — 21/21 — is the boot smoke test, since there are no dedicated
admin tests in the suite). No platform regression.

## 9. Authentication (OTP / SSO / federation / local self-service) — spec B.2–B.4, I.3–I.4

The whole `enterprise/authentication/` tree was stub modules (`createEnterpriseStubModule`) plus no-op
placeholders; it is now real, registered in the ENTERPRISE and CLOUD branches of `app.ts`.

**RBAC seam (spec I.3–I.4)** — principal-type dispatch behind the v2 authz seam: USER resolves an
effective project role and checks the permission; ENGINE/SERVICE check their project/platform binding;
everything else denies. Built-in roles are the platform-agnostic seeded rows (null `platformId`,
immutable); custom roles carry a real `platformId`. Backed by own `project_role`/`project_member`
tables and resolution — no third-party auth provider.

**OTP (B.2)** — `otp-service` issues single-use, purpose-bound codes, at most one per validity window
per (identity, purpose) — the window rate-limits issuance. The code is a high-entropy UUID; `confirm`
consumes it (PENDING → CONFIRMED) so it cannot be replayed. Public `POST /v1/otp`.
*Decision:* codes are stored as the emitted value (not hashed) with unguessable-UUID + consume-on-verify
providing the single-use guarantee — this is the behavior the local-authn contract requires (the presented
code must match the stored one) and matches the reference semantics.

**SAML 2.0 SSO (B.3)** — `saml-attributes` maps IdP claims onto email/first/last across plain, lowercase
Entra, and WS-Fed URI keys with admin overrides, rejecting partial identities; `saml-client` wraps
samlify as an SP (xmllint schema validation, per-platform client cache invalidated on config change,
SSRF-guarded IdP-metadata fetch); `authn-sso-saml-service`/module cover SP-initiated login, the assertion
consumer (→ federated sign-in + audit event), email-domain → platform discovery (only when claimed **and**
DNS-proven **and** SSO-licensed **and** SAML-configured), and SSO-domain claim/verify (TXT-record proof,
pending-claim TTL release).

**Federated / Google OIDC (B.4)** — `google-authn-provider` runs the authorization-code flow and verifies
the ID token (signature via Google JWKS, issuer/audience/email-verified) before trusting claims;
`federated-authn-service`/module expose login + claim (→ federated sign-in + audit). `getThirdPartyRedirectUrl`
returns the real `/redirect` callback the flag service surfaces in every edition. Token exchange goes
through the SSRF-guarded HTTP client per the outbound-HTTP rule.

**Local self-service (B.2)** — `enterprise-local-authn` verify-email and reset-password, each gated on a
valid purpose-matched OTP (wrong/expired/consumed all surface identically as `INVALID_OTP` → 410, so a
caller cannot probe which case occurred), with a per-user audit event.

**Team-project gate** — `projectMustBeTeamType` (used by invitation routes) replaced its always-deny stub
with the real check: project invitations may only target a TEAM workspace, never a personal one.

**Clean-room:** all files are independently authored with own structure and internal helper names
(`resolveField`/`firstNonEmpty`, `nextVerification`/`txtRecordMatches`, `assertOtpValid`/`recordIdentityEvent`,
`getGoogleCredentials`, `isWithinWindow`). Only the exported service/module/method names the wiring, tests,
and shared schemas require for interoperability are kept. No original authentication source was copied;
imports are from `@activepieces/shared` (blockunits layout), not the clone's `@activepieces/core-utils`.

**Files:** `authentication/project-role/{rbac-service,rbac-middleware}`, `projects/project-role/*` and
`projects/project-members/*` (RBAC + role-read slice), `authentication/otp/{otp-service,otp-module}`,
`authentication/saml-authn/{saml-attributes,saml-client,authn-sso-saml-service,authn-sso-saml-module}`,
`authentication/federated-authn/{google-authn-provider,federated-authn-service,federated-authn-module}`,
`authentication/enterprise-local-authn/{service,module}`, `api-keys/api-key-service`,
`authentication/ee-authorization` (`projectMustBeTeamType`), `helper/email/email-service`.

**Verification:** tsc 0 errors, lint clean (only the repo-wide `explicit-function-return-type` factory
warnings that `platformService`/`authenticationService` also emit). Tests green: saml-attributes 11,
saml-discover 3, enterprise-local-authn 6, otp 3, ee-authn 1, cloud-authn 13; RBAC Tier-1 58,
user-invitations 18. No regression: platform 21, concurrency-pool 8, worker-group 10. No stubs or TODOs
remain in `enterprise/authentication/`.

**Deliberately not rebuilt here:** the OTP delivery *templates* inside `email-service` (delivery degrades
safely to a no-op when SMTP is unconfigured — spec A.1: an email failure must not abort the triggering
operation); the license verify/apply subsystem the SSO admin paths would touch (a separate capability).

---

## 10. Project versioning & release (project-release + git-sync) — spec J.1

Scope: the enterprise **environment-promotion** capability — serialize a workspace's automation
work into a portable, credential-free *project state*; diff two states; apply (promote) one into a
workspace; and synchronize a workspace with an external SSH git remote. Implemented under
`packages/server/api/src/app/enterprise/projects/project-release/`. Entitlement-gated on the platform
plan's `environmentsEnabled` flag. No original EE source was copied.

### 10.1 Contracts derived (tests as source of truth)
The behavioral contract was reconstructed from the repo's own tests and MIT shared types, never from
licensed source:
- **Unit** — `project-state.service` (getFlowState strips extras + defaults `operationStatus`, getTableState
  pure mapping), `diff/flow-diff` and `diff/table-diff` (match by **externalId**, emit ops in
  `[DELETE, CREATE, UPDATE]` order, deep + property-order-independent compare, **piece versions compared at
  major.minor only**, status excluded from content compare), `flow-apply` (apply delegates to a
  `projectStateHelper`; CREATE→republish ENABLED, UPDATE→republish preserving the target's status,
  DELETE→no republish; republish errors are collected non-fatally, create/update/delete errors propagate;
  unknown op skipped).
- **Integration** — `git-repos` (configure/list/delete/push under `/v1/git-repos`, sshPrivateKey never
  returned, strict slug/branch/remoteUrl validation, cross-project ⇒ 403), `project-release`
  (`/v1/project-releases` create/list/get/diff; PROJECT release imports another same-platform workspace;
  `environmentsEnabled:false` ⇒ **402**; cross-platform/non-existent `targetProjectId` ⇒ **403**; wrong
  `projectId` on a service call ⇒ **404**; cross-project get ⇒ **403**).

### 10.2 Business-logic decisions
- **External-id is the universal correlation key.** Flows and tables are diffed and matched across
  workspaces by `externalId` (falling back to row id), so the same entity authored in one workspace is
  recognized in another and a re-run's diff is idempotent.
- **Two consistency models, honored distinctly (spec-gap #9/#24).** A *release/promotion* is serialized
  per-project (single-flight `distributedLock` on create) and snapshots the applied state to a stored
  `PROJECT_RELEASE` file for rollback. Apply is deliberately **not** wrapped in one DB transaction: it
  schedules out-of-band work (trigger registration on publish) that cannot live in a SQL transaction, and a
  republish failure on one flow is collected as a `FlowSyncError` rather than aborting the whole apply —
  recovery is by idempotent, external-id-keyed re-run.
- **Feature gate is a plan matter → 402.** A new `platformMustHaveFeatureEnabledOrPaymentRequired` guard
  (added beside the existing `…FeatureEnabled`) denies with `FEATURE_DISABLED` (402 Payment Required),
  distinct from an authorization (403) denial — matching the release test's expectation and keeping
  entitlement separate from authorization (always-on, never on this branch).
- **Release sources (spec-gap: enumerated).** `resolveSourceState` handles all three: **PROJECT** (another
  same-organization workspace, guarded — a missing *or* cross-platform target both 403 so existence isn't
  leaked), **ROLLBACK** (a prior release's stored state file), **GIT** (the connected repo; empty state
  until synced).
- **Git branch-type delete propagation (spec-gap).** `onDeleted` (called on every flow/table delete in all
  editions) propagates a deletion to the remote **only** on a `DEVELOPMENT` (two-way) branch; on a
  `PRODUCTION` branch or with no repo it is a safe no-op and never throws.
- **Secrets at rest.** The git SSH private key is encrypted with `encryptUtils` before storage and omitted
  from every response (`GitRepoWithoutSensitiveData`); the exported project state carries only connection
  *references* (externalId + piece + display name), never secret values (spec J.1 "credentials MUST NOT be
  exported in clear").
- **Tenant scoping via the security layer.** Every route uses `securityAccess.project(…)` with the right
  resource (BODY `projectId`, QUERY `projectId`, or TABLE lookup on `GitRepoEntity`/`ProjectReleaseEntity`),
  so cross-project/cross-tenant access is rejected uniformly by the shared authorization guard.

### 10.3 Files
`project-release/project-state/{project-state.service, project-state-helper, project-diff.service}`,
`project-release/{project-release.service, project-release.dto, project-release.module}`,
`project-release/git-sync/{git-sync.service, git-sync.module}` (entities `project-release.entity` and
`git-sync/git-sync.entity` and their columns/indices/migration already existed and were verified — both are
registered in `getEntities()` and covered by the `CleanRoomBaseline` migration). Modules were already wired
in the CLOUD/ENTERPRISE branches of `app.ts`; their stub bodies were replaced with the real implementations.

### 10.4 Verification
- `tsc --noEmit` 0 errors; lint clean (only the repo-wide `explicit-function-return-type` factory warnings
  that `project-member.service`/`platform.service` also emit).
- Tests green — unit: flow-diff 9, table-diff 10, flow-apply 16, project-state 3; integration: git-repos 42,
  project-release 12. No regression in protected suites: platform 21, user-invitations 18, project-members,
  project-role, authorization-v2-project (71 across the cloud batch), concurrency-pool 8, worker-group 10,
  mcp-rbac, ce tables 68.

### 10.5 Deliberately deferred (with reason)
- **Replace / CI-CD bulk-import path (spec-gap #13/#14 — multi-status HTTP, preflight-compatibility
  protocol).** There is **no** replace endpoint, shared request type, or frontend caller for it anywhere in
  this repo, and no test encodes its contract. Building it would mean inventing an unverifiable public API
  (status codes, preflight categories) with no source of truth — a violation of the "no assumptions / must
  work" rule. Left unbuilt and recorded rather than shipped speculatively. The diff/apply engine it would sit
  on top of (external-id matching, per-item failure collection, idempotent re-run) is already in place, so it
  can be added cleanly when its contract exists.
- **Connection/table *apply* into a target.** The diff computes connection and table operations, but
  `projectStateService.apply` materializes **flows** only (the sole apply path the flow-apply contract and
  the PROJECT-release integration test exercise). Connection secrets are never exported, so importing a
  connection is a resolve/placeholder concern (spec-gap: "unauthorized placeholder") whose contract is not
  test-encoded here; wiring table/connection apply without that contract risks silent breakage. Flow apply is
  complete and correct; the rest is a documented extension point, not a broken partial.
- **Git push filesystem/network round-trip** is implemented for real (clone→serialize→commit→push via
  `simple-git` over the SSH key), but is not exercised by tests (no remote in the PGLite/in-memory-redis test
  env); it is defensively wrapped so a failure can never corrupt local state.

---

## 11. Project (workspace) CRUD, admin & alerts — spec I.5 / C.1 / C.2 / C.5 / A.2

Scope: the `/v1/projects` workspace-management surface (create/list/update/delete), the
identity-wide account switcher (`GET /v1/platforms`), the `/v1/alerts` recipient surface, and
the establishment side effects (alert receiver, shared-connection reconciliation). Backed by
the MIT core `projectService`/`userService`/`platformService`/`appConnectionService`. The
contract is derived from the repo's own integration tests (`cloud/project/project.test.ts`,
`ce/project/project.test.ts`, `cloud/alert/alert.test.ts`,
`cloud/project/platform-project-global-connections.test.ts`) and MIT shared types.

### 11.1 Bugs fixed in the project surface
The previous `platformProjectModule` had real defects (surfaced by the tests, not stubs):
- **Create returned 200, not 201.** Now returns `CREATED`.
- **Create/List by a SERVICE (API-key) principal 500'd** — the handler used `principal.id`
  as the owner, but an API-key principal has no user id, breaking the `ownerId` FK. Create now
  resolves the owner as the **organization owner** for a service principal; list treats a
  service principal as privileged (sees every workspace on its platform).
- **Cross-tenant delete/update returned the wrong result.** All lookups are now
  platform-scoped: a workspace in another organization surfaces as `ENTITY_NOT_FOUND` (404),
  never a 403 (so cross-tenant existence can't be enumerated), and the victim is left intact.

### 11.2 Authorization & enumeration (spec I.2/I.3/C.5)
- **List (Guarantee A):** privileged callers (platform ADMIN/OPERATOR, or any SERVICE/API-key
  principal) see every workspace in the organization; a non-privileged user sees only their own
  personal workspace plus shared workspaces they hold a membership in (via the core
  `applyProjectsAccessFilters`). List is `publicPlatform` (any org member may list — the set is
  simply narrower, possibly empty), not `nonEmbedUsersOnly`, so a bare member gets `200 []`
  rather than a 403.
- **`externalUserId` filter** resolves results on behalf of another user and is a
  **service-caller-only** facility: any interactive user (ADMIN/OPERATOR/MEMBER, own id or not)
  is rejected `403` *before* any lookup runs; an unknown external id yields an empty page (not
  404); it is platform-isolated. Combines with the `displayName` filter.
- **Mutation:** update requires platform ownership (ADMIN role) *or* a token scoped to that
  exact project; delete requires platform ownership. Ownership is role-based (a former owner
  demoted to MEMBER is denied), matching the platform-ownership guard.
- **Account switcher `GET /v1/platforms`** (USER-only; API key rejected): returns the caller
  identity's organizations each with the workspaces the caller may see there. The old
  `/v1/projects/platforms` URL is intentionally not registered (404).

### 11.3 Tri-state team-projects limit (spec I.7a / gap-report #1/#19)
Team-workspace creation is guarded by the plan's `teamProjectsLimit` before establishment:
`NONE` ⇒ team workspaces unavailable; `ONE` ⇒ at most one may exist (a second is denied);
`UNLIMITED` ⇒ no cap. A denied create returns `FEATURE_DISABLED` (**402** Payment Required) — a
plan matter, distinct from an authorization denial. Personal workspaces never count toward the
limit.

### 11.4 Establishment side effects (spec I.7 / A.2 / E.1)
- **Alert receiver:** the enterprise project post-create hook (`projectEnterpriseHooks`, set in
  the CLOUD/ENTERPRISE app.ts branches) registers a supplied `alertReceiverEmail` as an EMAIL
  alert recipient for the new workspace. Best-effort and idempotent (re-adding is a no-op); the
  email is lower-cased; omitting it subscribes no-one. Community keeps the default no-op hook.
- **Shared-connection reconciliation:** on create/update, `globalConnectionExternalIds`
  reconciles which organization-shared (PLATFORM-scoped) connections include the workspace —
  matched by external id **within the platform only**, adding/removing the workspace id
  idempotently. Gated on the `globalConnectionsEnabled` entitlement (disabled ⇒ silently
  ignored, never an error). An *absent* set leaves attachments untouched; an *empty* set
  detaches all. Implemented as `appConnectionService.reconcileProjectGlobalConnections`.

### 11.5 Alerts (spec A.2) — recipient management slice
The alerts stub was replaced with a real `/v1/alerts` project-scoped surface: create (200; a
duplicate receiver, case-insensitive, ⇒ `EXISTING_ALERT_CHANNEL`/409; on a *personal* workspace
the receiver MUST be the owner's own email, else 409), list (paginated, project-scoped —
cross-project ⇒ 403), and delete (200; WRITE_ALERT required, so a viewer is 403). Receivers are
stored lower-cased. Failure-notification *delivery* (`sendAlertOnRunFinish`) remains a safe
no-op (depends on the A.1 email transport and must never abort the run it reports on); the
recipient-registration half is what the project feature requires.

### 11.6 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (only the repo-wide factory
  `explicit-function-return-type` warnings that sibling built services also emit).
- Green: `cloud/project` 37, `ce/project` 2, `cloud/alert` 11, `cloud/app-connection` 7. No
  regression: platform 21, user-invitations 18, project-members, project-role,
  authorization-v2-project, concurrency-pool 8, plus the §10 J.1 suites (unit 38, releases 12,
  git-repos 42).

### 11.7 Deliberately deferred (with reason)
- **Global-connections feature (E.1 — `/v1/global-connections` create/list/delete).** Still a
  stub in this repo. The **project-side** reconciliation is fully implemented and correct
  (§11.4), but `platform-project-global-connections.test.ts` and `cloud/global-connection.test.ts`
  cannot pass until the `/v1/global-connections` endpoints exist (the tests create connections
  through them first). Building E.1 is a separate item (thin, since the core
  `appConnectionService.upsert`/`listForPlatform` already handle PLATFORM scope + encryption).
  Chosen per the maintainer's direction: implement reconciliation now, gate on E.1.

---

## 12. External secret-store integration (E.6) + organization-shared connections (E.1)

Scope: the external secret-manager capability (`/v1/secret-managers`) — pluggable provider
adapters, a distributed cache, live-validated config, and run-time secret-reference resolution
embedded in automation data — plus the organization-shared connection capability
(`/v1/global-connections`) it cross-checks with. Implemented under
`enterprise/secret-managers/` and `enterprise/global-connections/`. Contract derived from the
repo's own tests (`ee/secret-managers/secret-managers.test.ts`, `.../secret-manager-cache.test.ts`,
`cloud/global-connection/global-connection.test.ts`) and MIT shared types.

### 12.1 Provider adapter contract (spec E.6)
A fixed operation set every adapter implements — `checkConnection`, `connect`, `disconnect`,
`getSecret(path)`, `validatePath` — so the calling code is provider-agnostic; a `getSecretManagerProvider(id)`
registry is the only place adapters are wired. Four adapters ship:
- **HashiCorp Vault** (tested): AppRole login → KV read. Path grammar `<mount>/…/<field>` (≥3
  `/`-segments; last segment is the field). All calls go through `safeHttp.retryingAxios`
  (SSRF-guarded — Vault is an administrator-supplied host).
- **AWS Secrets Manager**: `@aws-sdk/client-secrets-manager`; path `<secret-name>:<json-key>`.
- **CyberArk Conjur**: REST authenticate → variable read via `safeHttp` (admin URL); path is a
  Conjur variable id.
- **1Password**: service-account token → item field via `safeHttp`; path `op://<vault>/<item>/<field>`.
`validatePathFormat` (HashiCorp) is exported and unit-tested directly.

### 12.2 Reference grammar & resolution (spec E.6 core)
A secret is referenced in flow inputs by `{{ <connectionId><separator><path> }}` (id/path split
on the FIRST `SecretManagerFieldsSeparator`). `resolveObject`/`resolveString` walk the value
recursively and substitute each embedded reference with the live value; a non-reference (and a
`{{…}}` lacking a separator) is passed through unchanged as a literal. Per-call failure policy:
strict (default — a genuine failure raises a typed error) or lenient (returns the original).
Resolution re-checks on every retrieval that the store belongs to the caller's organization AND
is in-scope for the executing workspace (organization-wide, or workspace-scoped listing this
workspace) — fail-safe deny on mismatch. These three functions (+ `containsSecretManagerReference`)
are the COMMUNITY-CRITICAL touchpoints called by app-connection upsert/use/refresh in every
edition; a value with no references is returned unchanged.

### 12.3 Distributed cache (spec E.6 caching guarantees)
`secret-manager-cache` — two artifacts in the shared Redis (coherent across instances), each
with a bounded TTL: connection **health** (only a *successful* check is cached — asymmetric, so
a transient outage isn't pinned unhealthy) and resolved **values** (cached ENCRYPTED via
`encryptUtils`, keyed by platform+connection+hash(path) — never in clear). Invalidation is scoped
(whole platform, or one connection) via Redis SCAN + delete over the key namespace, and every
config change (create/delete) invalidates the affected entries. An explicit
`DELETE /v1/secret-managers/cache` (admin/service) is exposed.

### 12.4 Config CRUD, scope & validation
A store carries a name, a scope (organization-wide PLATFORM or workspace-scoped PROJECT with a
non-empty projectIds list) and its encrypted provider config. On create the provider connection
is exercised LIVE before persistence (an unreachable/unauthorized config is rejected up front and
never stored); credentials are encrypted at rest and decrypted only in-process. Listing returns
each store WITHOUT credentials but WITH its scope, workspace list, and a configured/connected
status pair (admin sees a store that is set up but currently unreachable). Configuration is
administrator-only (a service principal is owner-equivalent); listing is member-readable; the
whole capability is entitlement-gated on `secretManagersEnabled`. Configuring/deleting a store
emits a security-relevant audit event (spec E.6 / K.1) — new `SECRET_MANAGER_CONNECTED/ROTATED/
DISCONNECTED` events added to the shared `ApplicationEvent` union and emitted via the existing
`applicationEvents.sendUserEvent` seam (credentials never included).

### 12.5 Organization-shared connections (E.1)
`/v1/global-connections` upsert / list / update / delete — administrator-only, driven by the
shared `appConnectionService` with PLATFORM scope. Upsert validates the piece version and that
the projectIds belong to the organization (invalid → 404), resolves secret-manager references in
the value for validation but PERSISTS the original reference (never the resolved secret — verified
by the secret-managers "should not persist resolved secrets" test), and encrypts at rest. This is
the endpoint the project-side `globalConnectionExternalIds` reconciliation (built in §11.4) and
the secret-manager persistence test both depend on.

### 12.6 Data-layer
`secret_manager` entity extended with `name`, `scope`, `projectIds` (registered in `getEntities()`);
a forward migration (`AddSecretManagerScopeAndName`) adds the columns and is listed in
`getMigrations()` (rollback-migrations test green). Shared `@activepieces/shared` bumped 0.92→0.93
for the new audit-event exports.

### 12.7 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (only the repo-wide factory return-type warnings).
- Green: secret-managers 15/15, secret-manager-cache 7/7, global-connection (all),
  platform-project-global-connections 9/9, project 37, app-connection (ce+cloud), rollback-migrations.
  No regression in the batches run.
- Pre-existing/out-of-scope: `cloud/audit-event/audit-event.test.ts` fails because the audit-logs
  admin surface (K.1) is a separate stub — its `/v1/audit-events` list endpoint is unbuilt; the
  secret-manager audit *events* are emitted through the shared seam regardless.

---

## 13. Audit logging (K.1)

Scope: the append-only, queryable audit trail (`/v1/audit-events`) — the compliance record of
security- and governance-relevant events. Implemented under `enterprise/audit-logs/`
(`audit-event-service`, `audit-event-module`; the `audit_event` entity already existed and is
registered/migrated). Contract derived from `cloud/audit-event/audit-event.test.ts` + spec K.1.

### 13.1 Writer — persisting the trail (spec K.1 "append-only")
The audit writer registers as a listener on the shared application-events seam
(`applicationEvents.registerListeners`) in the module's `setup()`, so every event emitted via
`sendUserEvent` / `sendWorkerEvent` — from project-role, project-release, connection,
secret-manager, and future features — is appended to `audit_event`. Persistence is best-effort:
a write failure is logged and swallowed so it can never propagate back into the operation that
emitted the event (a logging failure never breaks the action it records). This closes the loop
begun in §12 (the `SECRET_MANAGER_*` events emitted there are now actually recorded), and makes
the audit events emitted by the project-role/project-release/global-connection modules real.

### 13.2 Reader — `GET /v1/audit-events`
Owner-only (the guard is `platformMustBeOwnedByCurrentUser`; a non-admin member → 403), NOT
entitlement-gated (spec keeps audit availability in every edition because it underpins
compliance claims — so the gate is ownership, not a plan flag). Strictly platform-scoped: the
query always filters by the caller's `platformId`, so an event of another organization can never
be returned (verified by the test — org A sees only its own events). Newest-first, paginated
(cursor), with optional filters from `ListAuditEventsRequest`: action(s), project id(s), actor
(userId), and created-before/after — composed with typeorm `In`/`And`/`MoreThanOrEqual`/
`LessThanOrEqual`. The list is a pure read of the append-only table (no mutation surface).

### 13.3 Wiring
`auditEventModule` was already registered in the CLOUD and ENTERPRISE edition branches of
`app.ts` (its stub body was replaced with the real module + writer registration); no app.ts edit
needed. Registration is once per process, so the writer is added to the seam a single time. The
new persistence listener coexists with the existing seam consumers (badges, event-destinations)
— each emitted event fans out to all listeners; a user event and a worker event travel disjoint
paths, so there is no double-write.

### 13.4 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (only the accepted factory return-type warnings).
- Green: audit-event 2/2. No regression from the new persistence listener — event-emitting
  features stay green (project-role, project-role-events, app-connection-events 16/16), and the
  broad batch (secret-managers 22, global-connection, project 37, platform 21, user-invitations
  18 → 110) plus the EE batch (concurrency, mcp-rbac, project-members → 26) all pass.
- ~~Pre-existing/out-of-scope: `cloud/event-destinations/event-destination.test.ts` fails (404).~~
  **RESOLVED (later pass, see §30.4).** That suite targeted a legacy `/v1/event-destinations` + PATCH
  contract that was never a real endpoint — the same event-destination store is exposed through the
  canonical, house-style `/v1/platform-webhooks` surface (§30). The suite was adapted to that surface
  and a genuine service bug it surfaced (update-nonexistent → 500 instead of 404) was fixed.

---

## 14. Enterprise helper — transactional email (A.1) + white-label appearance (D.2)

Scope: the shared enterprise helper utilities under `enterprise/helper/` — the outbound
transactional-email layer (A.1) and the white-label theme resolver (D.2). Both were stubs (the
email service only debug-logged; the smtp probe always returned false; the theme was never
resolved). Contract derived from the touchpoint callers (otp/invitation/badge/flag services),
`cloud/user-invitations` + `ee/flags` + `ce/flags` tests, and spec A.1/D.2.

### 14.1 Email transport (A.1 "sender selection")
Three files under `helper/email/email-sender/`:
- `email-sender.ts` — the `EmailSender` contract: `isSmtpConfigured()`, `send(args)`,
  `validateOrThrow()`; `SendEmailArgs` carries multiple recipients, subject/HTML, optional
  reply-to, and sender identity.
- `smtp-email-sender.ts` — the real nodemailer transport. Config comes entirely from
  environment system props (`SMTP_HOST/PORT/USERNAME/PASSWORD`); **"configured" is
  all-or-nothing** (any missing field ⇒ unconfigured). A send under an unconfigured transport is
  a safe no-op. `validateOrThrow` verifies the transport in production only and raises
  `INVALID_SMTP_CREDENTIALS`. (`isSmtpConfigured` remains the public probe the invitation
  link-fallback and the frontend `SMTP_CONFIGURED` flag already consume.)
- `log-email-sender.ts` — the no-op/log sender; reports SMTP unconfigured and never throws.
- `index.ts` — env-based selection: TEST → log sender (the suite never sends real mail);
  PRODUCTION → SMTP; otherwise → SMTP only if configured, else log.

### 14.2 Templates (A.1 "templated messages")
`email-templates.ts` — a named-template catalog (`EmailTemplateName`) with a fixed TYPED
variable set per template and a per-template subject line (both public contracts), rendered with
Mustache (HTML-escaped) and wrapped in a shared BRANDED shell (organization logo + primary color
header, footer with an optional cloud-only legal address).

### 14.3 Email service (A.1 render + deliver)
`email-service.ts` — renders the branded template and delivers via the selected sender, enforcing:
- **Branding at render time** — each message is themed from the originating organization
  (name/logo/primary color), falling back to the system default when absent.
- **Edition gating** — email-verification codes and automation-issue/failure notifications are
  paid-edition only (no-op in community); invitations, member-added, and password reset are
  available in every edition.
- **Skip rules** — no verification code to an already-verified identity; no send to a recipient
  without a valid email; an empty recipient set sends nothing — none is an error.
- **Failure isolation** — a delivery error is logged and swallowed; it never aborts the caller.
The four live callers (`sendOtp`, `sendInvitation`, `sendProjectMemberAdded`,
`sendBadgeAwardedEmail`) keep their exact signatures; the four alerting/quota helpers (unused
until A.2/G are built) are implemented fully to their spec shape. OTP delivers a link to the
`verify-email?otpcode=…&identityId=…` / `reset-password?otpcode=…&email=…` frontend routes.

### 14.4 White-label appearance (D.2)
`helper/appearance/appearance-service.ts` — `getThemeForPlatform(platformId | null)` returns the
effective theme (via the core `generateTheme`/`defaultTheme`) with edition rules: COMMUNITY →
default; CLOUD → organization branding; ENTERPRISE → organization branding only when
`customAppearanceEnabled`, else default. A null context or any resolution error fails safe to the
default theme. This resolver is consumed by `enterpriseFlagsHooks.modify` (previously a
pass-through stub), which now substitutes the resolved theme into the `ApFlagId.THEME` flag so
the UI themes itself — the D.2 feature-flag consumption surface. It is also the branding source
for outbound messages (§14.3).

### 14.5 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (only the accepted factory return-type warnings).
- Green: `cloud/user-invitations` 18 (SMTP-unconfigured link fallback intact), `ee/flags` 1 +
  `ce/flags` 1 (theme resolution), and a broad batch (otp, cloud-authn, enterprise-local-authn,
  platform 21, project-members, audit-event → 76) plus the EE batch (flags, ee-authn,
  saml-discover, secret-managers, concurrency → 28). No regression.

---

## 15. Enterprise database-manager — data-layer registration & unified migrations (I.9)

Scope: the enterprise data-layer module that owns the enterprise/commercial ENTITIES and
MIGRATIONS and contributes them to the platform's single, unified schema. Implemented under
`enterprise/database-manager/`, extending (not forking) the base `database/` folder. Replaces
the historical `ee/database` folder. Contract derived from spec III "Migrations" + I.10, and the
`unit/app/database/rollback-migrations` + `integration/ce/database/rollback` tests.

### 15.1 What the module owns
- `enterprise-entities.ts` — `getEnterpriseEntities()`: the 21 enterprise/commercial persistent
  entities (project-member/plan/role, signing-key, oauth-app, otp, api-key, template, git-repo,
  audit-event, project-release, alert, secret-manager, chat-conversation, embed-subdomain,
  platform-analytics-report, concurrency-pool; and the cloud connection-key, app-credential,
  platform-plan, event-destination). This is the single place the enterprise entities are
  registered; the base `getEntities()` now composes `[...core, ...getEnterpriseEntities()]`.
- `enterprise-migrations.ts` — `getEnterpriseMigrations()`: the enterprise incremental
  migrations (currently `AddSecretManagerScopeAndName`), whose files live under
  `database-manager/migrations/postgres/`. New enterprise migrations are added here and nowhere
  else.
- `index.ts` — the barrel exporting both.

### 15.2 One authoritative, unified, forward-only migration list (spec III Migrations)
`postgres-connection.getMigrations()` is the single source: it concatenates the core migrations
(the entity-derived `CleanRoomBaseline`) with `getEnterpriseMigrations()` and sorts the whole set
by each migration's **monotonic timestamp key** (parsed from the class name), so:
- **Single ordered, forward-only sequence across editions** — enterprise migrations live in the
  same sequence the base edition runs, not a separate conditionally-executed set; ordered before
  the code paths that use those entities.
- **Unified, not edition-branched at run time** — `getMigrations()` has no edition branch; every
  edition (postgres + embedded PGLite; community/enterprise/cloud) applies the identical sorted
  list. Provenance ("Enterprise"/"Cloud") is comment-only.
- **Per-migration atomicity + idempotent run** — both datasources set
  `migrationsTransactionMode: 'each'` (own transaction per migration) and `migrationsRun: true`;
  TypeORM records applied migrations and skips them (safely re-runnable).
- **Data-store portability** — the same list drives production Postgres and embedded PGLite; in
  the TEST environment the schema is established by `synchronize: true` (fast/hermetic), the
  production path always runs the ordered sequence. Both `postgres-connection` and
  `pglite-connection` — and the rollback tooling (`rollback-migrations.ts`) — import
  `getMigrations()` from the one place, so the run path, the embedded/test store, and rollback
  can never diverge.

### 15.3 Verification
- `tsc --noEmit` 0 errors; lint 0 errors.
- Migration contract green: `rollback-migrations` unit 17 + `ce/database` rollback integration 8
  (the integration test runs the **real composed migration sequence** against Postgres via
  `initializeDatabase({ runMigrations: true })`, then exercises up/down rollback — proving the
  composed list applies and reverts cleanly on a populated store).
- Entity-registry integrity: 225 tests across enterprise-entity-backed features pass
  (secret-managers, alerts, project-role, audit-event, git-repos, project-members, platform;
  app-connection, tables, global-connection, concurrency, ce/project, user-invitations, flags) —
  the shared schema synchronizes with no dropped/duplicated entity.
- Pre-existing/out-of-scope: `cloud/chat` and `ee/embed-subdomain` fail with route **404** —
  their modules are stubs (no routes registered), unrelated to entity/migration composition (a
  broken entity would surface as a missing-relation error, not a 404); their entities register
  and synchronize correctly.

---

## 16. Token-signing key management (D.1)

Scope: the enterprise signing-key capability (`/v1/signing-keys`) — asymmetric key pairs an
organization uses to sign embed / managed-auth handshake tokens (foundational for B.6 and D.4).
Implemented under `enterprise/signing-key/`. Contract derived from spec D.1, the
`cloud/signing-key` + `cloud/signing-key/signing-key-events` tests, and the MIT shared types.

### 16.1 Integrity guarantee — private key never persisted (spec D.1)
The previous entity persisted a NOT-NULL `privateKey`, contradicting the spec (and the
`createMockSigningKey` mock, which has no private key). Corrected: the entity now stores only
`publicKey`, `displayName`, `algorithm`, and `platformId` — no private-key column. On generation
the service returns the private key to the caller EXACTLY ONCE (in the create response) and
discards it; the platform holds no copy to protect. A `DropSigningKeyPrivateKey` migration
(owned by the enterprise database-manager, §15) removes the column from the baseline table for
production Postgres; the test store synchronizes from the corrected entity.

### 16.2 Service (`signing-key-service.ts`)
- `add` — generates an RSA key pair (4096-bit modulus, PEM: SPKI public / PKCS8 private, via
  Node `crypto.generateKeyPairSync`), persists the public material + `algorithm: RSA`, and
  returns `{...SigningKey, privateKey}` once.
- `list` / `getOneOrThrow` / `delete` — all strictly tenant-scoped by `platformId` (a key of
  another organization is not-found, never leaked); reads/lists expose public material only.
- `verifyToken` — the `kid`-lookup verification protocol for B.6/D.4: decode the token header,
  read its `kid`; if absent or not resolvable to a stored key for the organization, reject with
  an invalid-token error; else verify the signature against that key's public material using its
  recorded algorithm (RSA → RS256). A missing kid, an unknown kid, and a signature failure ALL
  fail closed (throw INVALID_BEARER_TOKEN) — no principal is established. Because verification
  selects the key named by the token, coexisting keys (rotation) validate side by side.

### 16.3 Module (`signing-key-module.ts`)
`POST /` (create, 201) / `GET /` (list) / `GET /:id` (read) / `DELETE /:id` — ALL
organization-administrator only (`securityAccess.platformAdminOnly`; a non-admin user → 403, a
service principal acts for the organization) and gated on the embedding entitlement (a
plugin-scoped preHandler on `platform.plan.embeddingEnabled`). Key creation emits the
`SIGNING_KEY_CREATED` audit event (K.1) through the application-events seam (now persisted by
§13). The create response carries the one-time private key; list/read never do.

### 16.4 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (only the accepted factory return-type warning).
- Green: `cloud/signing-key` 5 (create returns RSA private key once + public key persisted;
  non-owner create/delete → 403; read + platform-scoped list), `signing-key-events` 1
  (SIGNING_KEY_CREATED emitted). The migration change is validated by `ce/database` rollback
  (the real composed sequence, including `DropSigningKeyPrivateKey`, applied against Postgres)
  and `rollback-migrations` unit. No regression: platform 21, audit-event, secret-managers,
  user-invitations, project-members, flags, concurrency (108 across the batches).

---

## 17. Enterprise feature-flags — the entitlement-resolver variation point (I.7 / D.2)

Scope: the enterprise flags hook (`enterprise/flags/enterprise-flags.hooks.ts`) — the ENHANCED
variation of the flags service (spec I.7 entitlement-resolver variation point). The base edition
emits system-default flags unchanged (the pass-through `flagHooks` default); the enterprise
variation, installed via `flagHooks.set` in the CLOUD/ENTERPRISE app.ts branches, resolves the
flags that legitimately differ per organization and substitutes them into the `GET /v1/flags`
map the frontend consumes. Contract derived from spec I.7/D.2, the `ce/flags` + `ee/flags` tests,
the core `flag.service`, and the frontend flag consumers.

### 17.1 What the hook resolves (for the caller's platform)
- **THEME (D.2)** — the platform's effective white-label theme via the appearance helper (§14),
  replacing the default theme. Always resolves (default when no organization context).
- **Platform-specific authentication flags** — for an authenticated organization context:
  - `THIRD_PARTY_AUTH_PROVIDERS_TO_SHOW_MAP` → `{ google: platform.googleAuthEnabled, saml:
    plan.ssoEnabled && SAML configured }`, so the sign-in page shows exactly the SSO buttons the
    organization has enabled (the core sets this to `{}`);
  - `SAML_AUTH_ACS_URL` → the platform's assertion-consumer URL (only when SAML is enabled);
  - `CLOUD_AUTH_ENABLED` / `EMAIL_AUTH_ENABLED` → the platform's own auth toggles.
- All other flags pass through unchanged.

### 17.2 Fail-safe (I.3)
A null/unknown organization context (unauthenticated / infrastructure principal — the CE flags
test) leaves the base auth flags in place and resolves the theme to the default. Resolving the
platform auth config is best-effort: any error is logged and the base flags are kept, so the
`/v1/flags` read never fails (it must remain available, even unauthenticated). Authorization
(Guarantee B) is never expressed through this variability mechanism.

### 17.3 Verification
- `tsc --noEmit` 0 errors; lint 0 errors.
- Green: `ee/flags` (authenticated → platform custom theme resolved) and `ce/flags`
  (unauthenticated → ENVIRONMENT + WEBHOOK_URL_PREFIX from the base flags, unchanged). No
  regression from the added per-request platform resolution: cloud-authn 13, saml-discover,
  ee-authn, enterprise-local-authn, signing-key, platform 21, user-invitations, project-members,
  audit-event, secret-managers (100+ across the batches). (The two intermediate cloud-authn
  "failures" were an edition mismatch — cloud-only sign-up/sign-in assertions run under `ee` —
  and pass under the correct `cloud` edition; not a flags regression.)

---

## 18. Management API credentials (F.1)

Scope: the enterprise API-keys capability (`/v1/api-keys`) — issuable organization-scoped
credentials granting programmatic access to the management interface (they authenticate a
caller as a SERVICE principal, spec I.2). Implemented under `enterprise/api-keys/`. The entity
and service were already correct (hashed-at-rest, truncated tail, last-used, cascade delete);
this task fixed the key length and built the admin CRUD module (previously a stub). Contract
derived from spec F.1, the `cloud/api-key` test, the MIT shared types, and the auth touchpoint.

### 18.1 Token format & storage (already correct; length corrected)
A key is a single opaque string: the stable public prefix `sk-` (the routing signal the auth
layer uses to recognize a management key vs a session token) plus a high-entropy random body,
fixed at a **total length of 64** (corrected from 67 — the body is now 61 chars so `sk-` + body
= 64, matching the token contract the test asserts). The secret is stored ONLY as a SHA-256 hash
with a 4-char truncated tail retained for display; the clear value is returned exactly once at
creation and is never persisted or recoverable.

### 18.2 Authentication (the reason the capability exists — already wired)
`core/security/v2/authn/authenticate.ts` recognizes a `Bearer sk-…` token by its prefix and
resolves it via `apiKeyService.getByValue` (hash the presented token, match the stored hash) to
a **SERVICE principal scoped to the key's owning organization**; an unknown/malformed/revoked key
throws an AUTHENTICATION error and never resolves to a valid principal (fail-safe). Each
successful lookup updates the key's `lastUsedAt` (dormant-key visibility).

### 18.3 Admin CRUD module (`api-key-module.ts`)
`POST /` (create, 201) / `GET /` (list) / `DELETE /:id` — all organization-administrator only
(`securityAccess.platformAdminOnly`; a non-admin user → 403, a service principal acts for the
organization) and gated on the `apiKeysEnabled` entitlement (a plugin-scoped preHandler). Create
returns the full record INCLUDING the one-time clear `value` (never the hash). List returns
records WITHOUT the secret and WITHOUT its hash — only display name, truncated tail, last-used,
and timestamps (the module strips `hashedValue` from every listed row). Deletion is
tenant-scoped and revokes immediately (the next `sk-` auth fails); deleting the organization
cascades its keys (FK ON DELETE CASCADE).

### 18.4 Verification
- `tsc --noEmit` 0 errors; lint 0 errors.
- Green: `cloud/api-key` 3 (create → 64-char `sk-` value, `hashedValue` absent; non-owner delete
  → 403; platform-scoped list without `hashedValue`). No regression from the key-length change on
  the SERVICE-principal auth path: authentication-v2, authorization-v2 (basic + project),
  git-repos-by-api-key, project (service context), global-connection, secret-managers,
  project-release (234 across the batches).

## 19. Failure alerts (A.2)

The alerts feature is two halves that share one entity (`AlertEntity`, project-scoped
`(channel, receiver)`): the **recipient registry** (who gets told) and the **failure dispatch**
(the thing that tells them). The recipient half was already built as a Project dependency (§11) —
`add`/`list`/`create`/`getOneOrThrow`/`delete`, with the personal-workspace owner-email rule and
the case-insensitive duplicate → `EXISTING_ALERT_CHANNEL` (409). Section A.2 completes the second
half: `sendAlertOnRunFinish`, which was a no-op stub.

### 19.1 The trigger (caller — unchanged)
`flow-run-hooks.ts` calls `alertsService(log).sendAlertOnRunFinish({ issueToAlert, flowRunId,
failedStep })` only when a run reaches a **failed** state in the **PRODUCTION** environment with a
non-nil **failedStep**, AND the edition is paid. `issueToAlert = { projectId, flowVersionId,
flowId, created }` (created is the run's ISO timestamp). The hook is best-effort by contract, so
the service must never throw back into the run-completion path.

### 19.2 Dispatch (`sendAlertOnRunFinish`)
1. **Deduplicate per automation version over a rolling 24h window.** `distributedStore.putIfAbsent(
   'alert:issue:<flowVersionId>', 1, 24h)` returns `true` only for the *first* failure in the
   window. If it returns `false`, `incrementDedupCounter` does an atomic Redis `INCR` on the same
   key (preserving the TTL set by the initial putIfAbsent) and the method returns without
   notifying — subsequent failures accrue a count but send nothing.
2. **Resolve recipients** via `listReceiverAddresses({ projectId, channel: EMAIL })` (bounded to
   `MAX_ALERT_RECEIVERS = 50`). Empty set → return (not an error).
3. **Resolve context**: `projectService.getPlatformId`, `flowVersionService.getOne` (→ display
   name, fallback `'Automation'`), `flowStructureUtil.getStepNumber(trigger, failedStep.name)`
   (1-based; 0 if not found), and the deep-link `domainHelper.getPublicUrl({ path:
   'projects/<projectId>/runs/<flowRunId>' })`.
4. **Dispatch** via A.1 `emailService(log).sendIssueCreatedNotification({ platformId, emails,
   flowName, issueUrl, stepName, stepNumber, errorMessage, timestamp })` — itself paid-edition
   gated and failure-isolated.
5. The whole body is wrapped in try/catch that logs and swallows (`log.warn`), so the run always
   completes.

### 19.3 Notification enrichment (A.1 touchpoints)
The `ISSUE_CREATED` template + `sendIssueCreatedNotification` were enriched from `{flowName,
issueUrl}` to also carry `{stepName, stepNumber, errorMessage, timestamp}` so the email names the
failed step, its position, the error text, and when it happened. `sendIssueCreatedNotification`
has exactly one caller (this dispatch), so the signature change is contained.

### 19.4 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (only the accepted factory return-type warning).
- Green: `cloud/alert` 11/11 (recipient CRUD, personal-owner rule, case-insensitive dup → 409,
  cross-project list scoping/403, viewer delete 403). The dispatch path has no dedicated test
  (the run-completion hook is not exercised for alerts); regression-checked by loading the
  flow-run module with the new alerts import graph — `ce/flow-run/list-flow-runs` 2/2 green (no
  import cycle: alerts → flowVersion/project/user/email/redis, none of which import back).

## 20. Integration availability governance (I.1)

The "pieces" feature is integration availability governance: per-organization control over which
integrations are available to its workspaces (allow/deny, private integrations), enforced both
when presenting the catalog and when a single integration is resolved for use. Two files:
`enterprise/pieces/filters/piece-filtering-utils.ts` (the enforcement variation point) and
`enterprise/pieces/platform-piece-module.ts` (organization-private install).

### 20.1 The two enforcement seams (already wired into core)
The core piece-metadata service calls the enterprise filtering utils at both read paths — this
seam pre-exists and is the established variation point (core imports the `enterprise/` util
directly, as the stub already did):
- **List path**: `pieceListUtils.filterPieces` → `enterpriseFilteringUtils(log).filter({ pieces,
  includeHidden, platformId, projectId })` returns the available subset.
- **Get path**: `pieceMetadataService.get` → `enterpriseFilteringUtils(log).isFiltered({ piece,
  projectId, platformId })`; true → the service returns `undefined` (piece treated as absent).

### 20.2 Governance model (two ANDed layers)
Availability is decided per piece by two independent layers; a piece is available only if BOTH
allow it:
1. **Organization (platform) filter** — `platform.filteredPieceBehavior` over
   `platform.filteredPieceNames`:
   - `ALLOWED` = allow-list: only named pieces are available.
   - `BLOCKED` = deny-list: named pieces are hidden; everything else available. Empty deny-list
     (the base case) hides nothing.
2. **Workspace (project) filter** — the project plan's `piecesFilterType` over `plan.pieces`:
   - `NONE` = no restriction; `ALLOWED` = allow-list of `plan.pieces`.

Governance is resolved ONCE per call (one `platformService.getOne` + one `project_plan` lookup),
then each piece's name is tested against the resolved sets. Organization-private visibility
(custom pieces owned by the platform, hidden from other tenants) is NOT re-implemented here — the
core `filterPieceBasedOnType` already applies it upstream in `fetchLatestPieces`/`filterRegistry`.

### 20.3 Always-on, fail-safe (Part III)
Enforcement is gated on **stored configuration, never on an edition/entitlement flag** — a
platform that configured a filter has it honored in every edition (these utils run in the core
piece path in CE too). A principal with no platform (unauthenticated / worker) has no governance
applied and sees the ungoverned (public-only) catalog. `includeHidden: true` is an explicit
administrative bypass on the list path. Base case (empty BLOCKED list + NONE project filter)
returns the list unchanged / `isFiltered` false — critical so piece listing never breaks.

### 20.4 Organization-private install (`platform-piece-module.ts`)
CLOUD / ENTERPRISE do **not** register `communityPiecesModule`, so the enterprise module owns
`POST /v1/pieces` there: install an organization-private (CUSTOM) piece — a private ARCHIVE
upload or a REGISTRY (npm) package (`AddPieceRequestBody`, both `PieceScope.PLATFORM`). Delegates
to the core `pieceInstallService.installPiece(principal.platform.id, body)`. Authorization is
`platformAdminOnly([USER, SERVICE])` — a non-admin is 403; the piece is always installed under
the caller's own platform id (tenant isolation). Installation is a core capability and is **not**
entitlement-gated (`managePiecesEnabled` governs the management UI, not this route) — the install
test expects 201 for an admin on a plan with `managePiecesEnabled=false`.

### 20.5 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (only the accepted factory return-type warning).
- Green: `cloud/piece-metadata` 10/10 (platform ALLOWED/BLOCKED, project ALLOWED, private-piece
  cross-platform visibility, official-vs-same-name-custom, version resolution, sorting);
  `cloud/mcp/mcp-piece-visibility` 2/2 (MCP `ap_research_pieces` honors platform BLOCKED via the
  same governed `list`); `ce/pieces/piece-install` 2/2 under both `ee` and `ce` (201 admin
  install, 403 member — was 404 before, the route was a stub); `ce/pieces/piece-metadata` 12/12
  and `ce/pieces/piece-sync-service` 3/3 (no regression from the real filter).
- `ce/pieces/piece-options-e2e` is a full worker/BullMQ/sandbox round-trip e2e (documented in its
  own header) that needs the engine to download+execute the real npm piece; it fails with an empty
  engine response (status 200, empty body) independent of governance — piece resolution through
  `isFiltered` succeeds (else it would 404), the gap is the sandbox execution infra, pre-existing.

## 21. Organization-provided OAuth client credentials (E.3)

An organization registers its OWN OAuth client credentials per integration ("piece"), used in
place of the platform defaults when brokering connections. `/v1/oauth-apps`. Three files (entity,
service, module) plus one migration. The entity and shared types (`OAuthApp`,
`UpsertOAuth2AppRequest`, `ListOAuth2AppRequest`) already existed; the module was a stub and there
was no service.

### 21.1 Entity + migration (encryption at rest)
`oauth-app.entity.ts` stores one app per `(platformId, pieceName)` (unique index). The client
**secret is sensitive** → encrypted at rest (Part III): stored as an `EncryptedObject`
(`{ iv, data }`) in a **jsonb** column, not a plaintext string. The entity now exports
`OAuthAppWithEncryptedSecret` (the persisted row) — a type the test's `createMockOAuthApp` helper
imports from the entity file. The prior entity's `clientSecret: String` was a defect: the test
saves an `EncryptedObject`, which fails against a varchar column (`Invalid input for string type`).
The CleanRoomBaseline created the column as `character varying`, so migration
`1782000000000-OAuthAppClientSecretToJsonb` (registered in `getEnterpriseMigrations`, ordered
after the baseline) `ALTER COLUMN ... TYPE jsonb` (a fresh deployment has no rows; any legacy
plaintext secret is unrecoverable as ciphertext and is intentionally discarded, not smuggled).

### 21.2 Service (`oauth-app.service.ts`)
- `upsert` — encrypts the secret, then insert-or-replace on `(platformId, pieceName)` (idempotent;
  re-registering a piece replaces the credentials rather than hitting the unique index). Returns
  the **public** shape (no secret).
- `list` — cursor-paginated, strictly `platformId`-scoped, secret stripped from every row.
- `delete` — `(platformId, id)`-scoped so one tenant can never delete another's; unknown/foreign
  id → `ENTITY_NOT_FOUND`.
- `getWithDecryptedSecret({ platformId, pieceName })` — the execution accessor (E.3 "used in place
  of platform defaults"): returns `{ clientId, clientSecret }` decrypted, or null when the org has
  registered no app (caller falls back to platform defaults). Server-side only; never over the API.

### 21.3 Module (`oauth-app.module.ts`) — asymmetric authorization
Registered in CLOUD + ENTERPRISE. The authorization is **asymmetric**, per the test contract:
- **Mutations** (`POST /` upsert, `DELETE /:id`) — `platformAdminOnly([USER, SERVICE])`: a
  non-admin (MEMBER) is 403; a service principal is allowed.
- **List** (`GET /`) — `publicPlatform([USER, SERVICE])`: any authenticated member of the org may
  list (the credential set is needed to build connections), scoped by the security layer to the
  caller's own org — a member of one org can never read another's (the two list tests, "by owner"
  and "by member", both expect 200; the member sees only their own platform's app).
Upsert returns 200 (not 201) with the public record (`clientSecret` undefined). Not
entitlement-gated at the module level — the test's owner upserts on a plan with
`embeddingEnabled=false` and expects 200.

### 21.4 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (only the accepted factory return-type warning).
- Green: `cloud/oauth-app` 6/6 (new-app upsert 200 + secret absent; non-owner upsert 403;
  non-owner delete 403; delete-by-id 200; list by owner and by member 200 with cross-org scoping
  and secret stripped). No regression: `cloud/app-connection` 7/7 (the adjacent OAuth2 area boots
  and works with the entity change). The `oauth_app` table has no other runtime reader — the
  connection token exchange takes client credentials from the connection request, not this table —
  so `getWithDecryptedSecret` is the forward-looking execution seam with no existing caller to wire.

## 22. Organization-shared connections — hardening pass (E.1, Tier 3)

The global-connections feature (`/v1/global-connections`) was already built in the E.1/§12 work
(a thin owner-only controller over `appConnectionService` with `AppConnectionScope.PLATFORM`;
upsert mints an external id, persists secret *references* not resolved values, encrypts at rest)
plus the project touchpoint (§11 `globalConnectionExternalIds` reconciliation in
`platform-project-module`: attach on create/update, absent set = untouched, `[]` = detach-all,
tenant-scoped, idempotent). A Tier-3 audit found both concerned suites already fully green
(`cloud/global-connection` 10/10, `cloud/project/platform-project-global-connections` 9/9) but
surfaced two genuine gaps, now closed:

### 22.1 Entitlement gate (spec E.1 "entitlement-gated" + Part III)
The module had **no** entitlement gate — a platform owner whose plan lacked shared connections
could still manage them directly through `/v1/global-connections` (the project reconciliation
path already gated on `globalConnectionsEnabled`, but the direct-management module did not). Added
a module `preHandler`: `platformMustHaveFeatureEnabled((platform) =>
platform.plan.globalConnectionsEnabled)` — a non-entitled platform is now rejected AUTHORIZATION
403, matching the established gate pattern (api-keys F.1, signing-key D.1). The existing tests all
set `globalConnectionsEnabled: true`, so they stay green; the project-side "ignores … when feature
is disabled" test goes through the (already-gated) project module, not this route, so it is
unaffected.

### 22.2 Audit coverage on update (spec K.1)
Upsert emitted `CONNECTION_UPSERTED` and delete emitted `CONNECTION_DELETED`, but the **update**
route (display name / workspace attachments — a governance-relevant change) emitted nothing. Added
a `CONNECTION_UPSERTED` `applicationEvents(...).sendUserEvent` on the update path (same action the
base connection controller uses; the shared audit union and the audit-event builder already have
the case, so no shared change). The K.1 writer registered on the applicationEvents seam persists
it best-effort.

### 22.3 Verification
- `tsc --noEmit` 0 errors; lint 0 errors.
- Green after the change: `cloud/global-connection` 10/10 and `cloud/project/
  platform-project-global-connections` 9/9 (both under **cloud and ee**); regression
  `cloud/audit-event` 2/2 (the new update-audit persists without breaking the audit path) and
  `cloud/app-connection` 7/7 (the underlying service the module drives is unaffected).
- Authorization note: global connections are **owner**-only (stricter than admin) — the routes use
  `publicPlatform([USER, SERVICE])` plus an in-handler `platformMustBeOwnedByCurrentUser` check;
  the tests confirm 403 for a MEMBER on every operation. Left as-is (correct, intentional).

## 23. Server-mediated OAuth2 connection brokering (E.2)

The enterprise `app-connections` folder holds one file, `platform-oauth2-service.ts` — the
`PLATFORM_OAUTH2` broker. It was a STUB (`claim`/`refresh` threw `FEATURE_DISABLED`); now it is a
real server-mediated OAuth 2.0 authorization-code broker so an end-user connects a third-party app
without ever handling the client secret.

### 23.1 The seam
`oauth2Handler` (in `app-connection-service/oauth2/index.ts`) maps connection types to services:
`CLOUD_OAUTH2` → cloud broker, `OAUTH2` → credentials (client supplies the secret),
`PLATFORM_OAUTH2` → this broker. The community default is an `unimplementedService`; CLOUD /
ENTERPRISE replace it via `setPlatformOAuthService(platformOAuth2Service(app.log))` in `app.ts`.
Two call paths drive it: `validateConnectionValue` → `.claim(...)` on connect, and
`appConnectionHandler.refresh` → `.refresh(...)` on token expiry (under a distributed lock).

### 23.2 Where the client secret comes from (E.2 × E.3)
For `PLATFORM_OAUTH2` the claim request carries the public `client_id` but **no `client_secret`**
(and `PlatformOAuth2ConnectionValue` has no `client_secret` field — the secret is never persisted
in the connection). The broker resolves the secret server-side from the organization's registered
OAuth app (E.3): `oauthAppService(log).getWithDecryptedSecret({ platformId, pieceName })` — the
forward-looking execution seam built in §21 now has its consumer. This is E.3's "used in place of
platform defaults" made concrete: the org-registered app *is* the platform's OAuth client for that
piece. Fail-safe (Part III): no registered app → `INVALID_APP_CONNECTION` (the broker cannot
proceed without a credential) rather than a silent/partial connect.

### 23.3 Mechanics (mirrors the sibling `credentials-oauth2-service`)
- **claim**: resolve secret → POST the token endpoint (`grant_type=authorization_code`, `code`,
  `redirect_uri`, optional PKCE `code_verifier`), client auth applied by BODY or Basic HEADER
  (default BODY), via `safeHttp.retryingAxios` (SSRF-guarded, per the safe-http rule). Returns the
  formatted value (`oauth2Util.formatOAuth2Response`) plus `token_url`, `client_id`, `redirect_url`,
  `grant_type`, `props`, `authorization_method` — **no secret**.
- **refresh**: `oauth2Util.isExpired` short-circuits a still-valid token; else re-resolve the
  secret, POST `grant_type=refresh_token`, and `mergeNonNull` the response onto the existing value
  so a null `refresh_token` never clobbers the stored one; `type`/`props` preserved.

### 23.4 Verification
- `tsc --noEmit` 0 errors; lint 0 errors (2 `redirectUrl!` non-null-assertion *warnings*, identical
  to the sibling `credentials-oauth2-service` — accepted house style for this exact path).
- No test references `PLATFORM_OAUTH2` (broker `claim`/`refresh` are not exercised by the suite —
  they require a live third-party OAuth token endpoint). Validated by: app boots with the real
  broker installed in CLOUD/ENTERPRISE (no import cycle — `oauth-apps` does not import
  `app-connections`), and every adjacent connection path is green: `cloud/app-connection` 7/7,
  `ce/app-connection` 25/25, `ce/app-connection-events` 2/2, and the secret-source `cloud/oauth-app`
  6/6.
- Community edition keeps the `unimplementedService` default (no platform brokering there) —
  correct and intentional; `setPlatformOAuthService` is only called in CLOUD/ENTERPRISE.

## 24. Connection signing keys (E.4, keypair half)

`enterprise/connection-keys/` is the workspace-scoped signing-key primitive of the legacy
embedded-provisioning subsystem (spec E.4). It was a STUB module (+ an already-correct entity).
**Scope decision (agreed):** build the self-contained, verifiable keypair-management half now;
stub the token-provisioning half, which is entangled with the still-stubbed `app-credentials`
feature and has no test contract. Two files added (service + real module); the entity and its
baseline migration already existed and were correct (`connection_key`, `settings jsonb`, project
FK CASCADE, `idx_connection_key_project_id`), registered in `getEntities()` — no schema change.

### 24.1 Service (`connection-key.service.ts`)
- `upsert` — despite the historical name, an **insert-per-call**: mint an RSA-4096 keypair
  (SPKI/PKCS8 PEM, matching signing-key D.1), persist **only** `settings.publicKey` in the row,
  and return the record with `settings.privateKey` set **exactly once**. The private key is never
  stored (mirrors D.1's return-once guarantee, but workspace-scoped rather than org-scoped).
- `list` — cursor-paginated, strictly `projectId`-scoped, public material only.
- `delete` — by id (the module's TABLE guard has already confirmed workspace ownership).

### 24.2 Module (`connection-key.module.ts`) — `/v1/connection-keys`, CLOUD only
- `POST /` upsert — `securityAccess.project([USER, SERVICE], undefined, { type: BODY })` (projectId
  from body); returns the one-time private key.
- `GET /` list — `project(..., { type: QUERY })` (projectId from query).
- `DELETE /:connectionkeyId` — `project(..., { type: TABLE, tableName: ConnectionKeyEntity, lookup:
  { paramKey: 'connectionkeyId', entityField: 'id' } })`: the guard looks up the key row by id,
  reads its `projectId`, and authorizes — so a missing id is 404 and a cross-project id is 403,
  with no per-handler ownership code.
- **Token-provisioning half — DONE in §25** (was a fail-safe stub here). Once `app-credentials`
  landed, the three provisioning routes were implemented for real and moved to their own prefix
  `/v1/app-connections-from-token` (see §25.3 for why the prefix was separated). This §24 section
  now covers only the keypair primitive.

### 24.3 Verification
- `tsc --noEmit` 0 errors (whole project); lint 0 errors (only the accepted factory return-type
  warning).
- New suite `cloud/connection-key` **7/7**: create (public persisted, private returned once and
  **not** retrievable via a subsequent list), create/list/delete cross-project **403** (the QUERY /
  BODY / TABLE project guards), delete happy-path, and the token route failing safe (not 404, not
  200). No regression: `cloud/app-connection` 7/7 (the app boots with the real module registered).
- Community/enterprise editions do not register the module (CLOUD-only, matching where the
  reference registered it) — intentional.

## 25. App-credential store + token provisioning (E.4, completing connection-keys)

This completes the E.4 embedded-provisioning subsystem: the app-credential store (the "cloud
credential store") plus the token-provisioning protocol that ties it back to the §24 connection
keys. The store had a 5-test contract; the token flow had none (zero consumers in the repo — no
web, no embed-sdk) so it was implemented to **standard JWT conventions** (agreed via
AskUserQuestion) and covered with new tests.

### 25.1 App-credential store (`app-credentials.service.ts` + module) — `/v1/app-credentials`
Per-workspace, per-integration OAuth2 / API-key credential TEMPLATES. Entity + baseline migration
already existed (`app_credential`, `settings jsonb`, unique `(projectId, appName)`, CASCADE FK),
registered — no schema change. Service: `upsert` (idempotent per `(projectId, appName)` via the
unique index; OAuth2 template defaults `grantType=AUTHORIZATION_CODE` since the request omits it),
`list` (cursor-paginated, `projectId`-scoped, optional `appName` filter, **client secret censored
from every row**), `getOneOrThrow` (server-side, secret intact — the provisioning accessor),
`findProjectId` (resolve owning workspace from a credential id), `delete`. Module: `POST /` (project
BODY guard, returns 200 censored), `GET /` (**public** + required `projectId` — the embedded client
reads it — censored), `DELETE /:id` (project TABLE guard → cross-workspace 403 / unknown 404).
CLOUD-only. Tests: `cloud/app-credentials` 6/6 (create OAuth2/API_KEY, list, filter by appName,
censor clientSecret, delete).

### 25.2 Token provisioning (`connection-key-provisioning.service.ts`)
The protocol that consumes both halves: an embedded host signs a short JWT with a §24 connection
key's PRIVATE half; the server verifies it against that workspace's stored PUBLIC keys and
provisions an end-user connection from an app-credential template. Standard-conventions contract:
RS256; the token is tried against **each** registered public key until one validates (rotation
friendly; none → `INVALID_BEARER_TOKEN`); `sub` = the connection name; external id =
`{appName}_{connectionName}` (re-provisioning replaces). `upsertConnection`: resolve credential
project (`findProjectId`) → verify token against that workspace's keys → resolve the credential →
build the connection (**API_KEY** → `SECRET_TEXT` value from the presented `apiKey`; **OAuth2** →
an `OAUTH2` value carrying the template's `client_id`/`client_secret` + the request's `code` /
`redirectUrl`, whose authorization-code exchange the `appConnectionService.upsert` validation path
performs server-side) → upsert under `PROJECT` scope. `getConnection` / `deleteConnection` verify
the token, then read / delete by external id.

### 25.3 Route separation (no reliance on Fastify precedence)
The provisioning routes live under a **distinct prefix** `/v1/app-connections-from-token`
(`POST`/`GET`/`DELETE /`), NOT as an `/app-connections` sibling of the keypair
`DELETE /:connectionkeyId`. Sharing the `/v1/connection-keys` prefix would have depended on
Fastify resolving a static segment over a param — separating the prefixes removes that implicit
tiebreak entirely, so the two route families can never shadow each other.

### 25.4 Verification
- `tsc --noEmit` 0 errors (whole project); lint 0 errors (only accepted factory return-type
  warnings).
- Green: `cloud/app-credentials` 6/6; `cloud/connection-key` 7/7 (keypair, updated so the token
  test now targets the new prefix and asserts a token that validates against no workspace key is
  rejected); **new** `cloud/connection-provisioning` 2/2 — full happy path (mint a key → sign an
  RS256 JWT with the returned private half → register an API_KEY credential → provision a
  `SECRET_TEXT` connection with external id `{appName}_{sub}`, value never returned → read it back
  and delete it via token), plus rejection of an unknown credential. No regression:
  `cloud/app-connection` 7/7.
- Both halves of §24+§25 now work together end-to-end; the embedded-provisioning subsystem is
  complete. (The OAuth2 provisioning branch is implemented but not exercised by a test — it needs a
  live third-party token endpoint; the API_KEY branch is fully tested end-to-end.)

## 26. Managed authentication (B.4 / embedding)

`enterprise/managed-authn/` — the single PUBLIC endpoint `POST /v1/managed-authn/external-token`
that exchanges a host-signed external JWT for an authenticated Activepieces session, provisioning
the managed user / workspace / membership / concurrency pool as needed. Was a STUB module; now
three files: `lib/external-token-extractor.ts` (+ its two types, imported by the test), the
service, the module.

### 26.1 External-token extractor (`lib/external-token-extractor.ts`)
Defines and exports `ExternalTokenPayload` (`externalUserId`, `externalProjectId`, `firstName`,
`lastName`, `role`, optional `pieces` = `{filterType, tags}`, optional `concurrencyPoolKey` /
`concurrencyPoolLimit`) and `ExternalPrincipal` (payload + `platformId`) — **these types are
imported by the test's `auth.ts` helper**, so the file existing with this exact shape is a
compile-time touchpoint. `extract(token)` **delegates verification to the D.1 signing-key handshake
`signingKeyService.resolveAndVerify({ token })`** — the single shared seam that resolves a token's
`kid` to a stored key and checks its signature — then derives the platform from the resolved key
(the embed token carries none). An unknown `kid` (the handshake's `ENTITY_NOT_FOUND`) →
`AUTHENTICATION` (401) with the exact message `signing key not found signingKeyId=<id>` (the test
asserts both); any other failure (missing kid, bad signature) is also 401 (a bad embed token is an
auth failure, never a not-found leak).

**Reconciliation with D.1 (report follow-up):** the D.1 report stated `verifyToken` was "the exact
handshake managed-authn will consume." The first managed-authn cut instead duplicated the
kid-lookup+verify inline (a parallel, drifting path). That is now removed: `signingKeyService`
gained `resolveAndVerify({ token, platformId? })` — like `verifyToken` but the org scope is OPTIONAL
(embed tokens carry no platform, so the key is resolved by `kid` alone and the platform derived from
it) and it returns `{ signingKey, payload }`. The extractor consumes it, so there is now ONE
verification code path for every embed/managed consumer, exactly as D.1 promised. (managed-authn
11/11 and signing-key 5/5 both still green after the change.)

### 26.2 Service (`managed-authn-service.ts`) — provisioning orchestration
Idempotent by external identity. `externalToken`: extract → `getOrCreateUser` (by
`(platform, externalUserId)`; create → JWT-provider identity, `verified`, synthetic
`{externalUserId}@{platformId}.managed` email, `MEMBER` user with `externalId`) → `getOrCreateProject`
(by `(platform, externalProjectId)`; create → owned by the platform owner, `displayName =
externalId = externalProjectId`, `TEAM`, then a `project_plan` row whose piece filter resolves the
token's tag allow-list to piece **names** via `pieceTagService.findByPlatformAndTags`) →
`projectMemberService.upsert` (grant the token's role, idempotent) → `maybeAssignConcurrencyPool`
(only when key AND limit present: `concurrencyPoolService.upsertPool` — reused per `(platform,key)`
— then `projectService.update(poolId)` to set the column AND `assignProject` to refresh the
dispatch cache) → `authenticationUtils.getProjectAndToken` for the final `AuthenticationResponse`
(user + identity fields + session `token` + `projectId`).

### 26.3 Module (`managed-authn-module.ts`)
`POST /v1/managed-authn/external-token`, `securityAccess.public()` (no session — the signed token
is the credential, like sign-in/sign-up), body `ManagedAuthnRequestBody`, returns 200. Registered
CLOUD + ENTERPRISE.

### 26.4 Verification
- `tsc --noEmit` 0 errors (whole project, incl. the test that imports the extractor types); lint 0
  errors (accepted factory return-type warnings only).
- Green: `cloud/managed-authn/external-token` **11/11** — sign-up, create project, sync pieces
  (tags→names into `project_plan`), add member with role, add to existing project, sign-in existing
  user, signing-key-not-found 401 (exact message), and all four concurrency-pool scenarios (create
  +assign+cache; no-limit → no pool; reuse same pool across tokens; no-key → no pool). No
  regression: `cloud/signing-key` 5/5, `cloud/project` 37/37, `cloud/project-members` 13/13 (the
  service reuses these subsystems).

## 27. Custom embed subdomains (D.3)

`enterprise/embed-subdomain/` — serve an organization's embedded experience under its OWN hostname:
register the hostname with the edge provider (Cloudflare for SaaS), surface the DNS records the
customer must create, and resolve an incoming custom hostname back to its owning organization. The
service was a STUB (`getByHostname` → always null) + a STUB module; entity + migration already
existed and were correct. Three files: real service, `cloudflare-client.ts`, real module.

### 27.1 Edge-provider client (`cloudflare-client.ts`)
Wraps the Cloudflare **Custom Hostnames** public API (D.3 "CDN custom-hostname API") over the
SSRF-guarded `safeHttp.retryingAxios` (safe-http rule), configured from the existing
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_BASE` /
`CLOUDFLARE_SAAS_FALLBACK_ORIGIN` env. `createCustomHostname` POSTs `{hostname, ssl:{method:txt,
type:dv}}` and translates the response into `EmbedVerificationRecord[]` — a routing **CNAME**
(hostname → fallback origin, purpose HOSTNAME), the **ownership TXT**, and the **SSL DCV TXT(s)** —
plus the provider `id`. `getCustomHostnameStatus` reads back hostname/SSL active state.
**Optional integration:** when the env is unconfigured (self-hosted / the test env) the client
`isConfigured()` is false and the calls return null, so registration degrades to a records-less
pending record rather than failing. The four env vars — `AP_CLOUDFLARE_API_TOKEN`,
`AP_CLOUDFLARE_ZONE_ID`, `AP_CLOUDFLARE_API_BASE`, `AP_CLOUDFLARE_SAAS_FALLBACK_ORIGIN` — are
documented (commented, blank-by-default) in `.env.example` and `.env.dev`; a blank token or zone id
keeps the integration off (`resolveConfig` treats empty as unconfigured), so the default posture is
graceful degradation with no outbound call.

### 27.2 Service (`embed-subdomain.service.ts`)
- `getByHostname` — **now a real DB lookup** (was the always-null stub). This is the production
  consumer seam: `helper/embed-security.resolveAllowedOrigins` (the CSP `frame-ancestors` header,
  built per request in `server.ts`) calls it in CLOUD to map a custom hostname → owning platform →
  its `allowedEmbedOrigins`. Null → env-origin fallback (unchanged behavior for the common case).
- `getByPlatform` — the org's record (GET endpoint), or null.
- `generate` — normalize hostname, reject one already claimed by another org, call the edge client,
  persist a `PENDING_VERIFICATION` record (one per org via the unique platformId index; re-register
  replaces). `verify` — refresh status → ACTIVE when hostname+SSL are both live. `delete`.

### 27.3 Module (`embed-subdomain.module.ts`) — `/v1/embed-subdomain`, CLOUD + ENTERPRISE
Whole feature entitlement-gated: a `preHandler`
`platformMustHaveFeatureEnabledOrPaymentRequired((p) => p.plan.embeddingEnabled)` → **402** when
embedding is off. `platformAdminOnly` (acts on the caller's own org). `GET /` (record or null),
`POST /` (body `GenerateEmbedSubdomainRequest` — a lowercase FQDN, min 4, with a TLD; the Zod schema
rejects invalid hostnames **400** before any provider call), plus `POST /verify` and `DELETE /`.

### 27.4 Verification
- `tsc --noEmit` 0 errors (whole project); lint 0 errors (accepted factory warnings only).
- Green: `ee/embed-subdomain` **7/7** under **both ee and cloud** — GET null / GET record / 402 when
  embedding disabled / platform `allowedEmbedOrigins` update / three hostname-validation 400s (no
  TLD, <4 chars, uppercase). No regression: `cloud/platform` 21/21 (every request there exercises
  the CSP `getFrameAncestorsHeader` → real `getByHostname` → null → env fallback).
- The successful-registration (Cloudflare) path is not exercised by a test — the test env has no
  Cloudflare config, and the POST tests intentionally stop at hostname validation (400). The
  registration path is implemented and degrades safely when unconfigured (records-less pending
  record); it needs live Cloudflare credentials to exercise end-to-end.

## 28. Directory provisioning via SCIM 2.0 (B.5)

`enterprise/scim/` — the public SCIM 2.0 protocol so an IdP (Okta, Azure AD, …) auto-provisions and
de-provisions users and groups. Was a STUB module; now four files: `scim-common` (serializers +
discovery), `scim-user-service`, `scim-group-service`, `scim-module`. The shared package already
had the full SCIM schema set (`ScimUserResource`, `ScimGroupResource`, `ScimPatchRequest`,
`parseScimFilter`, the URN constants) — the contract source of truth.

### 28.1 Domain mapping
- **SCIM User → platform user + identity**, keyed by `(platform, externalId)`. `id` = platform user
  id, `userName` = email, `active` = user status ACTIVE/INACTIVE, name from the identity. Create
  provisions a JWT-provider verified identity (reusing an existing identity for the email) + user;
  idempotent per external id. DELETE **deactivates** (SCIM offboarding), not hard-delete.
- **SCIM Group → TEAM workspace**, keyed by `(platform, externalId)`. `id` = project id,
  `displayName` = workspace name, `members[].value` = member user ids (workspace members, granted
  the Editor role). DELETE soft-deletes the workspace (its GET then 404s, since the `deleted`
  `@DeleteDateColumn` auto-excludes it).

### 28.2 Services
- `scim-user-service`: create (idempotent, reconcile-or-provision), getOne (org-scoped, 404),
  list (`parseScimFilter` `userName eq`), patch (`active` toggle — handles `{value:{active}}` and
  `path:'active'`), replace (PUT), deactivate (DELETE).
- `scim-group-service`: create (TEAM project + members), getOne/list (org's TEAM projects), patch
  (add / remove — value or `members[value eq "id"]` path — / replace members; rename via
  `displayName`), replace (PUT = full name+membership re-assertion via a set-diff `replaceMembers`),
  delete (soft). **Fix found by test:** `projectService.update` only applies `displayName` when the
  request carries `type: ProjectType.TEAM` — the rename/PUT paths now pass it (was silently dropped).
- `scim-common`: `toScimUser`/`toScimGroup`/`toScimListResponse` and the three discovery documents
  (`ServiceProviderConfig` with patch+filter supported / bulk unsupported, `ResourceTypes` = User+
  Group, `Schemas`).

### 28.3 Module — `/v1/scim/v2`, CLOUD + ENTERPRISE
Entitlement gate `platformMustHaveFeatureEnabledOrPaymentRequired(scimEnabled)` → **402**.
`securityAccess.platformAdminOnly([SERVICE])` — **SERVICE-only** (the org API key an IdP presents):
an interactive USER or an unauthenticated caller is rejected **403**. Full route set:
Users + Groups (POST/GET/GET:id/PATCH/PUT/DELETE) and the three discovery GETs.

### 28.4 Verification
- `tsc --noEmit` 0 errors (whole project); lint 0 errors (accepted factory warnings only).
- Green: `ee/scim` **26/26** — user create/inactive/get/list/filter/PATCH deactivate+reactivate/
  PUT/DELETE-deactivate, group create/with-members/get/list/PATCH add+remove+rename/PUT-swap/
  DELETE-soft, the three discovery docs, auth (unauth 403, non-SERVICE 403, scim-disabled 402), and
  both full IdP lifecycle simulations (Okta offboarding + Azure AD membership replacement). No
  regression: `cloud/project` 37/37, `cloud/managed-authn` 11/11, `cloud/project-members` 13/13 (the
  provisioning subsystems SCIM drives).

## 29. Enterprise user extensions (B — user/profile surface)

`enterprise/users/user.module.ts` — was a STUB (registered no routes). The core platform-user
module (`user/platform/platform-user-module.ts`, all editions) owns list / admin-update /
admin-delete at `/v1/users` (`GET /`, `POST /:id`, `DELETE /:id`). This EE module ADDS the two
profile routes the core module lacks, sharing the same `/v1/users` prefix (Fastify merges them; no
route collides — the core module has no `GET /:id` and no `/me/profile-picture`):
- `GET /v1/users/:id` — fetch a single user scoped to the caller's organization via
  `userService.getOneByIdAndPlatformIdOrThrow` (unknown id or a user on another org → `ENTITY_NOT_FOUND`
  → **404**). `securityAccess.publicPlatform([USER, SERVICE])` — an interactive user OR a SERVICE
  (API-key) principal acting for the org.
- `DELETE /v1/users/me/profile-picture` — the current user clears their own avatar: resolve
  `principal.id` → the user's `identityId` → `userIdentityService.update(identityId, { imageUrl: null })`
  (imageUrl lives on the identity). `publicPlatform([USER])`. Returns `{ success: true }`.

Registered in every edition alongside the core module (line 211 in `app.ts`).

### 29.1 Verification
- `tsc --noEmit` 0 errors (whole project); lint 0 errors.
- Green: `ee/users` **6/6** — get by id, 404 non-existent, 404 cross-platform, SERVICE-key fetch
  allowed, SERVICE-key cross-platform 404, profile-picture delete `{success:true}`. No regression on
  the shared-prefix core routes: `cloud/user/platform-user` 10/10 (cloud **and** ee editions) and
  `ce/user/platform-user-community` 7/7 — the core list/admin-update/admin-delete routes are
  unaffected by the two added profile routes.
- Pure orchestration over existing services (`userService.getOneByIdAndPlatformIdOrThrow`,
  `userIdentityService.update`) — no new entity/migration, no new service, so the regression surface
  is just route co-registration, which the core-route suites confirm is clean.

## 30. Outbound platform event webhooks (platform-webhooks)

`enterprise/platform-webhooks/` — an organization registers webhook DESTINATIONS (a URL subscribed
to a set of application events) and the platform delivers a payload to those URLs whenever a
subscribed event fires. The `platform-webhooks.module` was a STUB; the underlying
`event-destinations` service/entity/worker-handler already existed and were correct but **unwired**
(its `setup()` was never called, so no events were delivered). Two gaps closed: the HTTP management
surface, and the delivery wiring.

### 30.1 Delivery wiring (the "wire in" the task asked for)
The `event-destinations` service (`src/app/event-destinations/`) has `setup()` which attaches a
listener to the shared application-events seam (`applicationEvents.registerListeners`) — every
emitted `sendUserEvent`/`sendWorkerEvent` is matched against registered destinations (by platform +
subscribed action, with a project-scope branch for `FLOW_RUN_FINISHED` and a self-webhook recursion
guard) and enqueued as an `EVENT_DESTINATION` worker job (`eventDestinationJob` delivers it via
`safeHttp`). `setup()` was **never called** → no deliveries. Now the platform-webhooks module calls
`eventDestinationService(app.log).setup()` in its body (mirroring how the audit-event module wires
its writer), so delivery is active exactly in the editions that register the module (CLOUD/
ENTERPRISE). Added a process-level idempotency guard (`deliveryListenerRegistered`) to `setup()` so
a re-init never double-registers the listener (which would double-deliver every event).

### 30.2 Module — `/v1/platform-webhooks`, CLOUD + ENTERPRISE
Entitlement-gated `platformMustHaveFeatureEnabled(eventStreamingEnabled)` → 403 when off;
`platformAdminOnly([USER, SERVICE])`. Routes over `eventDestinationService`: `POST /` create
(`CreatePlatformEventDestinationRequestBody` = `{url, events[]}`, PLATFORM scope, 201), `GET /` list
(cursor-paginated, platform-scoped), `POST /:id` update, `DELETE /:id`, `POST /test` (enqueue a mock
event to a URL, `{success:true}`).

### 30.3 Verification
- `tsc --noEmit` 0 errors (whole project); lint 0 errors (accepted factory warnings only).
- Green: **new** `ee/platform-webhooks` **9/9** (create + invalid-url 400 + gate 403 + non-admin 403,
  list scoped + cross-org isolation, update, delete, test). `cloud/event-destinations/
  event-destination-trigger` **16/16** — the delivery suite, incl. the *"ensure that we have setup
  the event streaming listeners"* regression that fires real `sendWorkerEvent`/`sendUserEvent` and
  asserts jobs are queued through the now-registered listener (this proves the wiring end-to-end).
  No regression on the shared event seam: `cloud/audit-event` 2/2, `ce/flow-run/list-flow-runs` 2/2.

### 30.4 Legacy `event-destination.test.ts` reconciled to the canonical surface (later pass)

The audit-logging work flagged `cloud/event-destinations/event-destination.test.ts` (11 tests, all
404) as an unregistered-feature gap. On investigation it was **not** a missing module — it was a
**duplicate legacy contract** for the *same* `event-destinations` service that §30 already exposes,
canonically and house-style, at `/v1/platform-webhooks`. The legacy suite hit a `/v1/event-destinations`
path that never existed and used **PATCH** for update (this codebase uses POST for updates, §4), and
even asserted a documented 500 "server bug".

Rather than add a second, divergent PATCH surface duplicating platform-webhooks, the suite was
**adapted to the canonical `/v1/platform-webhooks` endpoints** (create 201, list, POST /:id update,
idempotent DELETE 204, `/test`, plan-gate + admin auth), keeping the behaviours it uniquely exercised
(idempotent delete, `/test` with a default event, cross-platform isolation).

Adapting it surfaced a **real service bug**: `eventDestinationService.update` did
`repo.update(...)` then `repo.findOneByOrFail(...)`, so updating a non-existent (or cross-org)
destination threw a raw TypeORM `EntityNotFoundError` → **500**. Fixed with a platform-scoped
existence check that throws `IntellisperError(ENTITY_NOT_FOUND)` → **404** — a correctness
improvement that benefits the canonical `/v1/platform-webhooks` surface too.

- Green: adapted `cloud/event-destinations/event-destination` **11/11**; no regression —
  `ee/platform-webhooks` **9/9**, `event-destination-trigger` **16/16**, `cloud/audit-event` **2/2**.
  `tsc` 0 errors, lint 0 errors. Note: `embed-subdomain`'s interconnection (consumed by
  `helper/embed-security` via `getByHostname` for per-custom-domain CSP `frame-ancestors`) was
  verified intact — it was never part of this gap.

## 31. Licensed self-hosted usage metering & reporting (G.4.b, "flow-run-tracking")

`enterprise/flow-run-tracking/` — a scheduled daily system job that reports each licensed
organization's usage snapshot to the vendor's usage sink, keyed by the license key. The folder did
not exist and the feature had no in-repo contract; the G.4.b spec (added to the spec file this task)
is the authoritative contract. Two files: `flow-run-tracking-service.ts`, `usage-report-sink.ts`.

### 31.1 Scheduling & wiring (the "wire in" the task asked for)
`flowRunTrackingService(app.log).init()` runs in the shared `setupApp` (unconditional across
editions, right after `systemJobsSchedule.init()`): it registers a handler for the new
`SystemJobName.FLOW_RUN_TRACKING` job and upserts a repeated daily-cron schedule under the stable
job id `flow-run-tracking` (idempotent — one schedule survives restarts). The license-key gate is
inside the routine, not the registration (per G.4.b). Mirrors the `pieces-analytics.service`
register-handler + upsert-cron pattern.

### 31.2 The routine (`collectReports` + `reportAllPlatforms`)
Split for testability: `collectReports()` is pure aggregation → `UsageReportEvent[]`;
`reportAllPlatforms()` collects then captures each to the sink, best-effort (any error caught and
logged, never propagated). The routine loads `{platform → licenseKey}` for plans with a non-null
license key (empty → returns `[]`); for each licensed org it builds one snapshot `{ platform_id,
active_flows, projects, users, daily_executions:[{date,count}], reported_at }` with a single
`reported_at` shared across the run. Metrics (soft-deleted excluded): `active_flows` = ENABLED flows
joined to non-deleted projects; `users` = platform users (aliased `app_user` — `user` is a reserved
SQL keyword); `projects` = non-deleted TEAM; `daily_executions` = PRODUCTION runs in the UTC window.
Window = half-open UTC `[start-of-yesterday, start-of-today)`. Query discipline honored: the three
count aggregates run **sequentially**; executions fetch licensed workspace ids first, then a
`projectId IN (...)`-scoped run count **chunked** (200) + **throttled** (250 ms), rolled up in
memory. `usage-report-sink.ts` is a fire-and-forget capture (this edition's external relay is
removed, so it logs by default; independent of the telemetry opt-in flag — it is billing data).

### 31.3 Verification
- `tsc --noEmit` 0 errors (whole project); lint 0 errors (accepted factory warnings only).
- Green: **new** `ee/flow-run-tracking` **5/5** — licensed snapshot with correct metric counts
  (ENABLED-only flows, users, TEAM projects, PRODUCTION runs inside yesterday's UTC window with
  out-of-window + test runs excluded, keyed by license key); unlicensed platform not reported;
  empty report set when nothing licensed; one shared `reported_at` across orgs; `reportAllPlatforms`
  best-effort never throws. No regression from the new job + shared-setup init call: `ce/system-jobs`
  7/7 (scheduler works with the new job), `ce/flow-run/list-flow-runs` 2/2, `cloud/platform` 21/21
  (the app boots with `init()` in the shared setup).
- Bugs found + fixed during test: `user` reserved-word SQL syntax error (aliased `app_user`), and
  the active-flows join filter (switched to the `flow.project` relation join so the ENABLED filter
  applied). Enhancement: split `collectReports`/`reportAllPlatforms` so aggregation is verifiable
  without mocking the delivery sink.

## 32. License-key activation & entitlement application (G.4.a)

`enterprise/license-keys/` — a license key on the organization plan resolves (via a vendor-hosted
license service over SSRF-guarded HTTP) to an entitlement document whose feature booleans are
applied to the plan; expired/removed keys downgrade to free. The module was a stub `/verify` route
that granted nothing; now three files (`service`, `expiry-sweep`, real module) + the G.4.a spec
(added this task). The entitlement flags are what EVERY gated feature reads — this is the
activation that turns them on.

### 32.1 Service (`license-keys-service.ts`)
Vendor client over `safeHttp.retryingAxios` (safe-http rule) at `AP_LICENSE_KEY_URL` (default
`secrets.activepieces.com`). Operations: `requestTrial` (POST lead; 409 → EMAIL_ALREADY_HAS_ACTIVATION_KEY),
`getKey` (nil→null, 404→null, else throw; no side effects), `markAsActivated` (POST activate;
409/404 tolerated; best-effort KEY_ACTIVATED telemetry; whole call swallows errors),
`verifyKeyOrReturnNull` (compose-verify: nil→null → markAsActivated → getKey → expiry check),
`extendTrial` (operator-key header), `applyLimits`, `downgradeToFreePlan`, `verifyOnStartup`
(boot path). `applyLimits` writes one plan update: all entitlement booleans 1:1 + license key/expiry;
tier enterprise (internal when no SSO/embedding on cloud); `teamProjectsLimit` UNLIMITED if
manage-projects else edition default (ONE cloud / NONE self-hosted); commercial fields (stripe id/
status, active-flow/project limits) cleared; **default asymmetry — absent flags default off EXCEPT
`aiProvidersEnabled` (on); chat/dataManipulation off**. `downgradeToFreePlan` writes the full
turned-off set + clears license key/expiry + `teamProjectsLimit=NONE`.

### 32.2 Expiry sweep + module + consumers
`license-keys-expiry-sweep.ts` — `SystemJobName.LICENSE_KEY_EXPIRY_SWEEP` daily-cron (registered +
upserted at module init, idempotent guard): iterates licensed plans, per-org try/catch runs
compose-verify → `downgradeToFreePlan` (expired/missing) or `applyLimits` (valid, self-healing).
Module (`/v1/license-keys`, all editions): `GET /:licenseKey` (get-key) + `POST /verify`
(verify-and-apply → INVALID_LICENSE_KEY 400 on null), both `public()`; also calls `verifyOnStartup`
(boot) and wires the sweep. **Consumers wired**: the C.5 super-admin `applyLicenseKeyByEmail` (was a
stub throwing FEATURE_DISABLED) now resolves the org and funnels through the same
`verifyKeyOrReturnNull + applyLimits`; and `flow-run-tracking` (G.4.b) reads the `licenseKey` this
sets. Added `PlanName.INTERNAL` (shared 0.93→0.94) and env props `AP_LICENSE_KEY` /
`AP_LICENSE_KEY_URL` / `AP_LICENSE_KEY_EXTEND_TRIAL_API_KEY`.

### 32.3 Verification
- `tsc --noEmit` 0 errors (whole API + shared package); lint 0 errors (accepted factory warnings).
- Green: **new** `ee/license-keys` **6/6** — verify applies all flags + enterprise tier + UNLIMITED
  team + cleared commercial fields + activation-called; getKey 404→null / document / nil short-
  circuit; expired key → null; internal-tier; downgrade full off-set + license cleared; aiProviders-
  ON/chat-OFF default asymmetry. No regression: `cloud/platform` 21/21, `ce/system-jobs` 7/7 (new
  sweep job registers cleanly), `ee/secret-managers` 15/15 (a plan-flag-gated feature still gates
  correctly on the flag `applyLimits` sets). The vendor HTTP is mocked via `safeHttp.retryingAxios`
  get/post spies — the external license endpoint isn't reachable in the test env (fire-and-forget /
  best-effort paths degrade safely when unconfigured).

## 33. Organization template library (J.2)

`enterprise/template/platform-template.service.ts` — the CUSTOM (organization-scoped) template
writer. Was a STUB whose `create`/`update` threw `FEATURE_DISABLED`. The core template service
(`template/template.service.ts`) owns list / get / delete and the OFFICIAL/SHARED create-update
inline, and **delegates CUSTOM create/update to this service**; the controller
(`template.controller.ts`) enforces all authorization (owner-only for CUSTOM via
`platformMustBeOwnedByCurrentUser` + `assertTemplateBelongsToPlatform`; OFFICIAL/SHARED writes
rejected). So the only broken thing was the two CUSTOM writes throwing.

### 33.1 Service
- `create` — the core service already validates/prepares the flows+pieces before delegating, so
  this persists a `NewTemplate` (`type: CUSTOM`, `platformId`, all fields, `status: PUBLISHED`) to
  the shared `template` repo, mirroring the core OFFICIAL/SHARED persistence.
- `update` — applies only the supplied fields (via `spreadIfDefined`) to the template by id;
  re-validates flows (recomputing pieces) when flows are supplied, matching the core update path;
  returns the updated row.
- The factory now takes `log` (needed by `templateValidator` on update). The two call sites in the
  core template service were updated to pass `log`.

### 33.2 Verification
- `tsc --noEmit` 0 errors (whole project); lint 0 errors (accepted factory warning).
- Green: `cloud/flow-templates` **11/11** under **both cloud and ee** — the two previously-broken
  writes (create CUSTOM → 201 with metadata preserved; update own CUSTOM → 200 with the new name)
  now pass, alongside the authz suite the controller enforces (list CUSTOM-only, member 403, IDOR
  403, OFFICIAL not deletable/updatable, unauthenticated 403). Pure orchestration over the existing
  `template` repo + validator — no new entity/migration; the only regression surface is the factory
  signature change, and the sole caller (the core template service) is covered by this suite.

### 33.3 Interaction completion (producers / consumers / governance / infra)
Audited the template hub's 10 cross-feature interactions against the codebase. **Nine were already
correctly wired** (verified, not assumed): (A1) `flowService.getTemplate` serializes the live flow
to a SHARED DTO with connections/sample-data sanitized and pieces recomputed via
`flowPieceUtil.getUsedPieces`; (A2) `tableService.getTemplate` serializes to a SHARED template with
a `tables` payload (the entity carries the `tables` jsonb column); (B3) flow create accepts
`templateId` provenance (entity + `CreateFlowRequest` + service) — instantiation is the flow
feature's workspace-authorized write, template stays data-only; (C4) the custom loader returns `[]`
when `manageTemplatesEnabled` is off and CUSTOM writes require it, via the same
`platformService.getOneWithPlanOrThrow` resolution every gated feature uses; (C5) §32 `applyLimits`
/`downgrade` write `manageTemplatesEnabled` — the template feature only reads it; (C6) the operator
surface (`admin-platform-templates-cloud.module`) sets the `TEMPLATES_CATEGORIES` flag and enforces
OFFICIAL-only curation, while the tenant controller rejects OFFICIAL create (VALIDATION) and
OFFICIAL/SHARED update/delete (AUTHORIZATION); (D7) `GET /categories` reads `TEMPLATES_CATEGORIES`
and `TEMPLATES_PROJECT_ID` is surfaced through `flag.service` client bootstrap; (E9) create/update
run `migrateFlowVersionTemplateList` (preValidation) + `templateValidator.validateAndPrepare`;
(E10) `TemplateEntity` is registered (enterprise-entities) with a nullable-platform FK CASCADE.

**One genuine gap fixed (D8):** `community-templates.service` — the off-managed-cloud vendor library
loader — made its three outbound calls (`getOrThrow`, `getCategories`, `list`) with **raw `fetch()`**
against the operator-configured `AP_TEMPLATES_SOURCE_URL`, violating the safe-http rule (an
admin-config-sourced URL must go through the SSRF-guarded client). Replaced all three with
`safeHttp.retryingAxios.get` (per the rule; closes the DNS-to-connect TOCTOU window, rejects
private/link-local/metadata IPs). Behavior preserved: `getOrThrow` maps any failure to
`ENTITY_NOT_FOUND`, `getCategories`/`list` degrade to `[]` (unchanged empty-when-unconfigured
posture). No remaining raw `fetch` in the template area.

- Verification: `tsc` 0 errors, lint 0 errors; `cloud/flow-templates` 11/11 and `cloud/flow` 9/9
  (the producer `getTemplate` path + the OFFICIAL anonymous-list path that routes through the
  now-safeHttp community loader) both green under cloud and ee.

## 34. AI chat / agent (H.2)

Chat is the platform's largest, most independent capability: a two-tier conversational agent
split into a **control plane** (the API — HTTP surface, durable persistence, provider/tier
resolution, prompt assembly, approval gates, abuse controls; it enqueues a background job and
never calls the model) and an **execution plane** (the worker — the streaming multi-step model
loop, no DB access, which calls back into the control plane over a fixed RPC contract for every
stateful operation). Nothing downstream depends on chat, so it was built last.

**Scope decision (user-approved).** On reaching the live-turn control plane I surfaced the fork
via `AskUserQuestion`; the user directed: *ship the tested surface now, and report exactly what a
full live turn still needs — because that surface may already exist in another feature folder.* An
`Explore` sweep of the entire repo **confirmed it does not**: outside the durable-CRUD/pure-module
work below, every live-turn control-plane responsibility is still the throwing/no-op stub. So this
section ships the durable control plane + the pure logic modules (both fully tested), and documents
the deferred live-turn surface precisely (see "Deferred" below).

### What shipped (DONE, tested — 104 tests green)

**Conversation control plane — `enterprise/chat/`.** `chat.module.ts` (replacing the
`createEnterpriseStubModule` stub) registers `/v1/chat/conversations`: POST create (201; a
conversation is created with `projectId` **always null**, `status` IDLE, `messages` `[]`,
`uiMessages` null, and null title/model when the body omits them), GET list (a `SeekPage` in
`body.data` whose `select` deliberately **excludes** the heavy `messages`/`uiMessages`/`summary`
blobs), GET `/:id`, POST `/:id` update (title + modelName, `spreadIfDefined`), DELETE `/:id`
(204), and GET `/:id/messages` (a `SeekPage` of the persisted `uiMessages ?? []`). Every route is
`securityAccess.publicPlatform([USER])` — chat conversations are **user + platform scoped, not
project scoped** — reading `request.principal.platform.id` and `request.principal.id`. Any
out-of-scope id (cross-user, cross-platform, or missing) is reported as a uniform 404, so a caller
cannot distinguish "not yours" from "does not exist".

`chat-conversation.service.ts` owns the record and the **crashed-turn liveness recovery (H.2.c)**:
a turn marks the row STREAMING and the worker heartbeats `updated`; if the worker dies the row is
stuck STREAMING forever. On *every* read, a STREAMING row whose `updated` is older than
`STREAMING_STALE_MS` (2 minutes) is recovered to IDLE via a conditional `UPDATE` gated on
`status = STREAMING` (so a concurrent live worker heartbeat/finish always wins the race), and the
recovered status is persisted so subsequent reads see IDLE. IDLE and ERROR are never affected by
staleness.

**Pure logic modules — core `src/app/chat/` (the 4 unit-tested files, 80 tests).** These are
deterministic, DB-free, model-free, and shared by the execution plane:

- `chat-compaction.ts` (`chatCompaction`, H.2.h) — `estimateTokenCount` (~4 chars/token over
  `JSON.stringify(messages)` plus the system-prompt length); `shouldCompact` (true once the
  estimate crosses **70%** of the provider's context window — `aiProviderUtils.getMaxContextTokens`,
  ANTHROPIC 200K / GOOGLE 1,048,576 — and the conversation is at least 10 messages long); and
  `buildCompactedPayload` (summary-null → return history by reference; otherwise prepend a
  `[Previous conversation summary]` user message and keep the recent window from
  `summarizedUpToIndex`, trimming oldest-first but **never dropping the final message** and never
  leaving an orphaned leading `tool` message, throwing `CHAT_CONTEXT_LIMIT_EXCEEDED` if even
  summary + last-message overflows).
- `sandbox/sandbox-agent.ts` (`SandboxSessionUpdateType`) — the closed 7-value session-update wire
  vocabulary (`agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`,
  `plan`, `session_info_update`, `usage_update`).
- `sandbox/ai-event-utils.ts` (`chatEventUtils`) — defensive extractors over the loosely-typed
  session updates: `extractContentText`, `isHistoryReplayContent` (detects the runtime's
  session-resume preamble — raw `jsonrpc`+`session/update` envelopes, replay/truncation banners, or
  serialized history events), and `extractToolOutput` (prefers a flat `rawOutput` string, else
  concatenates `content[]` text blocks).
- `sandbox/stream-adapter.ts` — `createHistoryReplayFilter` (a detecting→suppressing→passthrough
  state machine, `DETECTION_BUFFER_LIMIT` 500 / `SUPPRESSION_BUFFER_LIMIT` 200, that suppresses the
  replay preamble and fails *open* so real content is never eaten) and `createStreamWriter`
  (translates each session update into the client's UI-message-stream parts — `text-*`,
  `reasoning-*`, `tool-input-*`, `tool-output-available`, `data-session-title`, `data-plan`,
  `data-usage` — opening text/reasoning parts lazily and closing them before a tool call).

**DB / wiring already correct.** The `chat_conversation` entity (`chat-conversation-entity.ts`) is
registered in `getEnterpriseEntities`, and the table already exists in the `CleanRoomBaseline`
migration with the exact clean-room columns. The MCP-OAuth chat integration
(`CONVERSATION_ID_HEADER`, `resolveConversationProjectId`) is already wired in the mcp-oauth
controller, and `sendChatEvent` (the websocket `CHAT_MESSAGE_CHUNK` realtime fan-out) is already
real in `worker-rpc-service.ts`.

**One dead file removed.** `migration/postgres/1776200000000-AddChatTables.ts` was an **orphan** —
unregistered in `getMigrations`, and carrying a *different, upstream* schema (`sandboxSessionId`,
`totalInputTokens/OutputTokens`, plus `sandbox_sessions`/`sandbox_events` tables) that does not
match the clean-room entity. Deleted; no references remain.

### Live-turn control plane (now BUILT end-to-end)

The worker execution plane was already fully built (`packages/server/worker/.../ee/chat/`:
`execute-chat-agent.ts` — the `streamText` multi-step loop with phase discovery→build, tool-call
repair, truncation/empty auto-continuation, batched chunk streaming, 3s cancel-polling, approval
gates, auto-title; plus `chat-mcp-client.ts` and `chat-worker-tools.ts`); it reaches the API only
through `ctx.apiClient` RPC. A repo-wide sweep confirmed **none** of the API-side control plane
existed elsewhere. It is now implemented, reusing the platform's real primitives rather than
re-inventing them:

**Send-message + turn lifecycle.** `POST /v1/chat/conversations/:id/messages`
(`SendChatMessageRequest`) fences the conversation with `startTurnOrThrow` — a conditional
`UPDATE … WHERE status = <prior>` that flips exactly one of IDLE/ERROR → STREAMING (a second
concurrent send loses the race and gets 409). It then enqueues `WorkerJobType.EXECUTE_CHAT_AGENT`
via `jobQueue(log).add({ type: ONE_TIME, data: ExecuteChatAgentJobData })` (schemaVersion
`LATEST_JOB_DATA_SCHEMA_VERSION`, priority `high`), returning `{ runId }` (202). If the enqueue
throws, the fence is rolled back (`markError`) so the conversation never sticks STREAMING. Two
sibling endpoints: `POST /:id/cancel` (→ `chatTurnStore.requestCancel`, the worker's 3s
`__cancel_check` poll sees it and aborts) and `POST /:id/gates` (the client's approve/reject of an
open gate → `decideGate`, first-decision-wins). All three are owner-scoped (404 for another user's
conversation).

**`getChatConfig`** (`chat-config.service.ts`) assembles the full `ChatConfigResponse`: provider +
decrypted auth + config via `aiProviderService.getChatProvider({ platformId })` (falling back to the
managed Activepieces provider), the tier from `ACTIVEPIECES_CHAT_TIERS` (requested model or
`DEFAULT_CHAT_TIER_ID`) for `modelId`/`thinkingBudget`; the system prompt built from the embedded
assets with `{{PROJECT_LIST}}`/`{{PROJECT_CONTEXT}}`/`{{FRONTEND_URL}}` substituted; the message
history — the new user turn appended to the persisted log (`allMessages`) and compacted through the
pure `chatCompaction.buildCompactedPayload` to fit the provider window (`messages`) — plus
`previousUiMessages` (prior UI history + this user turn, which the worker uses to detect the first
turn for auto-title); a short-lived MCP OAuth token via
`mcpOAuthTokenService.issueInternalAccessToken({ userId, platformId, projectId })` + the `/mcp`
server URL (`mcpCredentials`); the user's accessible `projects` via
`projectService.getAllForUser`; and the on-demand `guides`. **Secret material (provider auth, MCP
token) travels only over this trusted worker RPC — never to the client.**

**`executeChatTool`** (`chat-tool-executor.ts`) dispatches the two families the worker calls into the
control plane: the **cross-project tools** — `ap_discover_action_auth` (piece-auth probe +
available-connection listing), `ap_execute_action` / `ap_explore_data` (single piece action, run
ad-hoc via the shared `executeAdhocAction` in the active project, resolving the user-selected
connection server-side so secrets never reach the model), `ap_list_across_projects` (flows / tables
/ runs / connections across the user's workspaces) — and the four **coordination pseudo-operations**
`__cancel_check`, `__approval_wait`, `__store_pending_gate`, `__store_selected_connection`.

**Turn coordination store** (`chat-turn-store.ts`) holds all live-turn state in `distributedStore`
(short-TTL'd) rather than adding DB columns: approval gates (register → poll → decide, first-wins,
fail-closed so an unknown gate stays `pending`), the cancel flag, and the per-conversation
user-selected connections that the action executor reads.

**Persistence handlers** (`saveChatMessages` / `updateChatProgress` / `updateProjectContext` in
`chat-rpc-handlers.ts` → new `chat-conversation.service` methods): `saveTurn` writes the final
model/UI logs and returns the conversation to IDLE (recording an auto-title/model when provided) and
clears the cancel flag; `updateProgress` is the rolling UI heartbeat that bumps `updated` (feeding
the staleness check) while staying STREAMING; `setProjectContext` binds/clears the active project.
The worker's best-effort empty-payload error save is treated as a no-op so it never clobbers history.

**Prompt assets** (`chat-prompt-assets.ts`) embeds the system prompt, project-context fragments, and
the four guides as string constants **generated byte-for-byte** from `src/assets/prompts/*.md`, so
they ship identically under dev (`tsx` → `src`) and prod (`tsc` → `dist`, which does not copy `.md`
assets). The generated file is the single source read at runtime; regenerate from the assets if the
prompts change.

- Verification: `tsc` 0 errors (API **and** worker); lint 0 errors (only the accepted factory
  return-type warning); `unit/app/chat` 80/80, `integration/cloud/chat` (`chat` 18 +
  `chat-stuck-streaming` 6 + new `chat-send-message` 7) 31/31 — **111/111 green**; regressions
  `ce/mcp` 100, `ce/ai-provider` 5, `ce/app-connection` 27 all green. (Worker-package chat unit
  tests are unrunnable on this Windows harness due to a pre-existing absolute-path glob in the
  worker `vitest.config.ts` — the whole worker suite reports "no test files"; worker `tsc` clean
  covers the contract.)

### Analytics & billing telemetry (H.2.m — internal-admin local store)

Re-scoped from an external console-push design to a **local-store, internal-admin** analytics system:
**zero outbound HTTP, zero phone-home** — metrics are written to a local DB table and surfaced only
through an operator-gated admin API + admin web UI. (The earlier console-push telemetry —
`chat-telemetry.ts`/`billing-event-sink.ts`, the `INTELLISPER_CONSOLE_*` props, the `sync-all`
endpoint — was removed; the pure helpers, the rollout funnel, and `getChatProviderName` were kept.)

**Data model.** `chat_message_metric` (entity `chat-message-metric.entity.ts` + enterprise migration
`1782100000000-AddChatMessageMetric`, registered in `getEnterpriseEntities`/`getEnterpriseMigrations`):
one row per completed message — platformId (indexed), projectId (nullable), userId (indexed),
conversationId (indexed), provider/model (names only), toolsUsed, messageChars, licenseKey; indices
`(platformId, created)` and `(userId, created)`. No conversation-snapshot table — conversation/ops
views read `chat_conversation` live; the funnel reads the rollout service live. A daily prune
(`chat-metrics-prune.ts`, `SystemJobName.CHAT_METRICS_PRUNE`, `init()` at app boot) deletes rows
older than `CHAT_METRICS_RETENTION_DAYS` (default 90) so the table stays bounded.

**Ingest (write path).** `chat-metrics-recorder.ts` — `recordMessageMetric({ conversation,
turnToolCount })` inserts ONE local row (resolving provider name + concrete model id + the org's
license key). No HTTP, no SDK, no secret. Gated by `CHAT_METRICS_ENABLED` (default on). Fired
`void` (not awaited) from the `saveChatMessages` RPC handler only when a real turn persisted, and the
whole body is `tryCatch`-wrapped so a metric write — even a DB error — can never slow or fail a turn.

**Read API (operator-gated, `/v1/admin/chat-analytics`).** `chat-analytics.controller.ts` +
`chat-analytics.service.ts`. **Dual-gated** (defense in depth): a `preHandler` allows the request if
the operator `api-key` header matches `AppSystemProp.API_KEY` OR the caller is an authenticated
platform-admin (JWT verified via `accessTokenManager` → `PlatformRole.ADMIN`); anonymous/tenant
principals get 403 (deny-by-default — an unset operator key alone does not open it). Registered under
both CLOUD and ENTERPRISE. Five GET endpoints: `/usage` (totals + a `day|platform|provider|model`
series over the metric table, via `COUNT`/`SUM`/`COUNT(DISTINCT …)`/`date_trunc` GROUP BY), `/by-org`
(per-org rollup sorted by messages desc, paginated, joining platform name + latest in-range license
key), `/conversations` (live `chat_conversation` metadata — **no message bodies** — filterable by
org/user, paginated), `/conversations/:id` (detail: metadata + UI-message projection; access logged),
`/rollout-funnel` (live `getFunnelSnapshot`). No secret material is ever returned.

**Admin UI (`packages/web`).** A platform-admin-gated page at `/platform/observability/chat-analytics`
(route wrapped in `PlatformLayout` → `useIsPlatformAdmin`; nav item under "Observability"). Three
tabs — Usage (date-range + stat row + grouped series table + provider/model breakdown), By
Organization (sortable table → drill-in), Conversations (filterable table → detail sheet with message
text) — plus a rollout-funnel stat card. Reads via `chat-analytics-api.ts` using the standard `api`
client, which sends the logged-in platform-admin's JWT (the dual-gate's admin path) — **no operator
secret is ever held in the browser.**

**Supporting pieces kept from the prior pass:** pure helpers (`chat-telemetry-helpers.ts` —
`resolveMessages`, `resolveModelId`, `extractToolCallsSummary`, `countToolCallsInLatestTurn`); the
self-contained Redis-backed capped rollout funnel (`chat-rollout.service.ts` —
`getFunnelSnapshot`/`recordLanded`/`recordChatted`, monotonic `closed`, `CHAT_ROLLOUT_CAP`), still fed
by `recordLanded` on list and `recordChatted` on send in the chat module; and
`aiProviderService.getChatProviderName` (name-only, no secret). Config props: `CHAT_METRICS_ENABLED`
(bool, default on), `CHAT_METRICS_RETENTION_DAYS` (number, default 90), `CHAT_ROLLOUT_CAP` (number).

**The one remaining stub — where to start the internal event service:** `captureBillingEvent`/
`billing-event-sink.ts` was removed; the metric row IS the local billing record. If a richer external
usage-metering emitter is ever wanted, it is a new fire-and-forget consumer of `chat_message_metric`
(or an extra `void` call alongside `recordMessageMetric`) — not part of this local-store scope.

- Verification (DoD): `grep` of the whole analytics feature for `fetch`/`axios`/`safeHttp`/
  `activepieces.com` → **none**; recorder is fire-and-forget and failure-isolated (a dangling-FK
  insert error is swallowed, turn unaffected — tested); every read endpoint 403s without operator key
  **and** rejects a member/tenant principal (tested); entity registered + migration + retention prune
  scheduled; conversation list carries no message bodies (tested); detail access logged; UI gated
  behind platform-admin; no vendor URLs. `tsc` 0 errors (server + the web page); lint 0 errors on new
  files. Tests: `unit/app/chat/chat-telemetry-helpers` 11/11 + `integration/cloud/chat/chat-analytics`
  10/10 (dual-gate ×4, usage aggregation, by-org, conversations-no-bodies + detail, 404, recorder
  isolation, funnel). Full chat suite **131/131**; regressions `ee/license-keys` 6, `system-jobs` 7,
  `cloud/platform` 21 green.
