# Onboarding — blockunits enterprise clean-room

> Read this first. It orients you to **what this codebase is**, **the one rule you must never break**, **where the truth lives**, and **how to build & verify**. It is a map, not a substitute for the code — verify every file:line against the current tree before you rely on it.

---

## 1. What you are working on (and what you are NOT)

You are working in **`c:\projects\apprendai\kurvablocks\blockunits`** — a fork of the open-source **Activepieces** workflow-automation platform (multi-tenant: **Platform → Projects → Users**, 400+ pieces, MCP support).

The active task is a **clean-room re-implementation of the commercially-licensed Enterprise Edition (EE) features**. In this fork the EE layer has been **renamed** from the upstream `ee/` to **`enterprise/`**. So:

- Feature code lives under **`packages/server/api/src/app/enterprise/`** (NOT `src/app/ee/`).
- The word **"enterprise"** in paths/naming = what upstream Activepieces calls **"ee"**.

### The sibling folders — know which is which

Inside `c:\projects\apprendai\kurvablocks\` you will see several directories. **Only one is yours:**

| Folder | What it is | May you use it? |
|---|---|---|
| **`blockunits/`** | ✅ **The clean-room. This is where you work.** | Yes — edit here. |
| `activepieces-clone/` | ❌ The **commercially-licensed** upstream clone. | **NEVER read it as a source, never copy from it.** It is licensed code; copying defeats the entire clean-room exercise. |
| `blockunits - Copy/` | A stale copy/backup. | Ignore it. Do not edit. |
| `tenancy-and-enterprise-capability-spec.md` | The capability **spec** (what each EE feature must do). | Yes — this is a primary reference (see §3). |

> ⚠️ **This is not the "ApprendAI agent / Intellisper" project, and it is not the "cline" / activepieces integration work.** Those are unrelated codebases elsewhere in the workspace. Everything in this onboarding is about the **blockunits platform clean-room** only. If a task mentions the learner app, the Chrome extension, Intellisper, or the ApprendAI server, it does **not** belong here.

---

## 2. The clean-room rule (do not break this)

**You may re-implement EE behavior, but you must NEVER copy, paraphrase line-by-line, or derive the implementation from the licensed clone (`activepieces-clone/`).**

Your allowed sources of truth for *what a feature must do* (its contract) are, in priority order:

1. **The repo's own tests** — the integration/unit tests in `blockunits` are the executable contract. Make them pass.
2. **`@intelblocks/shared` types** — the shared DTOs/enums/schemas define the wire contract.
3. **The capability spec** — `kurvablocks/tenancy-and-enterprise-capability-spec.md` (also mirrored at `blockunits/docs/rewrite/tenancy-and-enterprise-capability-spec.md`), organized by lettered/numbered clauses (e.g. **B.5** = SCIM, **E.6** = secret managers, **J.1** = project release, **H.2** = chat). Tasks reference these clause IDs.

If the spec is silent on a behavior, the tests + shared types win. If **all** are silent, that's a genuine decision point — make a sensible, documented choice (the prior work used `AskUserQuestion` for these); do **not** fill the gap by looking at the licensed clone.

---

## 3. Where the truth lives (read these before touching a feature)

Everything below is inside `blockunits/`.

| Document | Path | Use it for |
|---|---|---|
| **Agent guide** | `AGENTS.md` (and `CLAUDE.md`, which just points to it) | House conventions: edition safety, entity registration, HTTP verbs, error handling, file-ordering, SSRF, testing. **Read this fully.** |
| **Safety rules** | `.claude/rules/*.md` | Short, load-every-session invariants: `data-isolation.md`, `edition-safety.md`, `entity-registration.md`, `safe-http.md`. Treat as hard constraints. |
| **Feature dossiers** | `.agents/features/<name>.md` (~60 lines each) | Per-feature entities, services, data flows. **Read the relevant one before modifying a module.** |
| **Skills / workflows** | `.agents/skills/` | Step-by-step recipes (`/add-feature`, `/add-entity`, `/add-endpoint`). |
| **Build log (34 §-sections)** | `docs/rewrite/platform-cleanroom-build.md` | The running record of **what has already been clean-roomed and how**, section by section (§10 project-release, §12 secret-managers/global-connections, §28 SCIM, §34 chat, etc.). When memory/onboarding references a "§NN", it means a section here. **Start here to see how prior features were built and which decisions were made.** |
| **Capability spec** | `docs/rewrite/tenancy-and-enterprise-capability-spec.md` | The clause-by-clause requirements (B.x auth, E.x connections/secrets, G.x licensing, H.2 chat, I.x platform, J.x projects, K.1 audit). |
| **EE API contract map** | `docs/rewrite/ee-api-contract-map.md` | Endpoint ↔ contract cross-reference. |
| **Stub index** | `docs/rewrite/stub-index.md` | Historical list of what was stubbed vs built. |
| **Broken-imports worklist** | `docs/rewrite/broken-imports-worklist.md` | Import/wiring cleanup tracker. |

---

## 4. Architecture rules you must honor (non-obvious)

These come straight from `AGENTS.md` + `.claude/rules/` — the ones most likely to bite you:

- **Multi-tenant isolation (hard rule):** every DB query MUST filter by `projectId` or `platformId`. For multi-project connections use `ArrayContains([projectId])` on the `projectIds` column.
- **Edition layering:** three editions — **CE** (`AP_EDITION=ce`), **EE** (`ee`), **Cloud** (`cloud`). EE/Cloud extend CE via a **hooks factory**, wired in the **edition switch in `packages/server/api/src/app/app.ts`** (`case ApEdition.CLOUD / ENTERPRISE / COMMUNITY`). **Never import `enterprise/` code from CE code.** To extend CE behavior: `hooksFactory.create<T>(ceDefault)` in CE, then `.set(eeImpl)` in the `app.ts` switch.
- **Entity registration is manual:** a new TypeORM entity MUST be (1) added to `getEntities()` in `database/database-connection.ts` and (2) given a migration registered in `getMigrations()`. In this clean-room the enterprise entities/migrations are centralized in **`enterprise/database-manager/`** (`getEnterpriseEntities()` / `getEnterpriseMigrations()`) — the single authoritative list consumed by postgres, pglite, and rollback. TypeORM does **not** auto-discover; skipping registration = silent runtime failure.
- **HTTP verbs:** `POST` for all creates **and updates**, `DELETE` for deletes. (No PUT/PATCH in this codebase.)
- **Every endpoint needs a `securityAccess` config.** Common gates:
  - Feature entitlement: `platformMustHaveFeatureEnabled((p) => p.plan.<flag>)` → **403**; the `…OrPaymentRequired` variant → **402**.
  - Admin/owner: `platformMustBeOwnedByCurrentUser` (a `SERVICE` principal passes).
  - Scope helpers: `publicPlatform([USER, SERVICE])`, `platformAdminOnly([...])`.
- **Audit events** flow through `applicationEvents(log).sendUserEvent(request, { action, data })`. Any **new** event name must get a case in BOTH the shared `ApplicationEvent` union AND the mock-event-builder, or `tsc` breaks.
- **Outbound HTTP must be SSRF-safe:** use `safeHttp.axios` / `safeHttp.createAxios` (or `apAxios` for trusted Intellisper endpoints) from `@intelblocks/server-utils`. Never raw `fetch`/`axios.create` for user/admin/OAuth/third-party URLs.
- **Encryption:** `encryptUtils.encryptObject/decryptObject/encryptString/decryptString` (the `EncryptedObject` type comes from `helper/encryption`, **not** from shared). Secret refs are persisted; resolved secret values are not.
- **Distributed coordination:** `distributedStore` (put/get/delete, `putIfAbsent`), `distributedLock`, `redisHelper.scanAll(redis, pattern)`, or `FOR UPDATE SKIP LOCKED` for concurrency.
- **`@intelblocks/shared` version bump:** any change under `packages/shared` requires a version bump in its `package.json` (patch for additions/fixes, minor for new exports/behavior) — **but first check whether the branch already bumped it.**
- **File ordering / style:** imports → exported functions/consts → helper functions → types (exported types/consts at the **end** of the file). No `any`, no gratuitous `as` casts, Go-style `tryCatch`/`tryCatchSync`, named (single destructured object) parameters, immutable data flow (return collections, don't mutate caller-passed bags). Comments explain *why*, never *what*.

---

## 5. How to build, test, and verify

From **`packages/server/api`** (the server package you'll mostly touch):

- **Type-check:** `npx tsc --noEmit -p tsconfig.json`
- **Integration/unit tests (this Windows harness):** the suites run via the **winrun vitest config**:
  ```
  WINRUN_INCLUDE="<path-or-glob-to-suite>" AP_EDITION=ee npx vitest run --config vitest.winrun.mts
  ```
  Set `AP_EDITION` to the edition the suite asserts (`ee` or `cloud`) — **cloud suites assert cloud-only behavior**, so pick per suite. Tests use PGLite + a real redis-memory-server; the DB is cleaned between tests.
- **Lint:** eslint on **specific files** with `NODE_OPTIONS=--max-old-space-size=8192` (broad globs OOM the linter). Repo-level convenience: `npm run lint-dev` (auto-fix) — **always run lint before considering a task done** (there's a pre-push lint/test gate).
- **Test-writing shape:** `setupTestEnvironment()` + `createTestContext(app)` → `ctx.post()/ctx.get()`; for SERVICE-principal tests use `createMockApiKey`.

Standard **Definition of Done** used throughout this clean-room: target tests green **+ no regressions in protected suites** (platform, project, authz, etc.) **+ `tsc` clean (server, and web if the change touches `packages/web`) + lint clean**. For any feature that must avoid phoning home, a DoD grep is used to prove zero `fetch`/`axios`/`safeHttp`/`activepieces.com` in the feature (see §34 in the build doc for the pattern).

> House-style note: factory functions written as `(log) => ({ ... })` with explicit return types produce a lint warning that is **accepted** here — don't "fix" it.

---

## 6. Current state (verify before trusting)

As of the latest build-log entries, **all enterprise feature modules have been implemented** — there are **no remaining `createEnterpriseStubModule` stubs**. The big surfaces are done and tested: platform tenancy/plan/billing, authentication (SSO/SAML/OTP/federated/RBAC), projects (CRUD + release + git-sync), alerts, secret-managers, global-connections, audit-logs, SCIM, managed-authn, embed-subdomain, license-keys, flow-run-tracking, platform-webhooks, oauth-apps, app-credentials/connection-keys, template library, and **chat (H.2) end-to-end incl. live-turn control plane + local-store analytics**.

**Known documented deferrals / thin spots** (from the build log + gap report — confirm current status before acting):
- **Project replace / CI-CD bulk-import**: the multi-status HTTP replace endpoint + preflight compatibility checks were **deferred** — no endpoint/type/test exists in the repo, so building it would be inventing an unverifiable API. See `docs/rewrite/platform-cleanroom-build.md` §10.5 and the **project feature-gap report** for the intended contract (replace is idempotent-partial, NOT one transaction; 207/422/502/409 multi-status; connections-first apply ordering; tri-state team-projects limit).
- A few provider "happy paths" are implemented but **untested** because they need live external endpoints (Cloudflare custom-hostname success, PLATFORM_OAUTH2 against a live OAuth server, OAuth2 token-provisioning) — validated by boot + regressions only.

Because the tree moves, **do not treat "done" as permission to skip reading the code.** Re-run the relevant suite and `tsc` to see current reality before you start.

---

## 7. First moves for any task here

1. **Identify the spec clause** (e.g. "E.6", "J.1", "H.2.x") the task names, and read that clause in `docs/rewrite/tenancy-and-enterprise-capability-spec.md`.
2. **Find its build-log section** in `docs/rewrite/platform-cleanroom-build.md` (search the clause ID) to see what's already there and why.
3. **Read the feature dossier** `.agents/features/<name>.md` and the module folder under `enterprise/<name>/`.
4. **Find the contract tests** for that feature and run them (winrun, correct `AP_EDITION`) to see current pass/fail.
5. Implement to the **tests + shared types + spec** — never the licensed clone.
6. **Verify:** target tests green, protected suites non-regressed, `tsc` clean, lint clean.

If a needed contract genuinely doesn't exist anywhere in the repo (no test, no type, no spec clause), surface that as a decision point rather than inventing an API or reaching into `activepieces-clone/`.
