# Broken Imports Worklist — EE Removal

Concrete enumeration of every reference into the deleted `ee/` paths in the **production
`src/` tree** (the build-breakers), each mapped to the interface it needs and the
edition-aware seam that selects community vs. enterprise/cloud behavior.

Scope: `packages/server/api/src/**` only (tests excluded — they don't break boot; fix
after). `embed-sdk` (`@activepieces/ee-embed-sdk`) is a separate frontend concern.

## Seam types (how edition selection happens)

- **Registry seam** — a runtime registry whose implementation is `.set()` by the edition
  switch in `app.ts` (the existing `projectHooks` / `flagHooks` pattern). Best for
  behavior that varies by edition.
- **Module-registration seam** — `app.register(<module>)` inside the edition `switch`.
  Community simply doesn't register it; enterprise/cloud does. Best for whole feature
  HTTP modules.
- **Service-interface seam** — a service object behind an interface; community = base/stub
  impl, enterprise = full impl, chosen at construction by edition/plan.
- **Entity seam** — persistent entities must be registered with the data layer
  unconditionally (schema must exist in all editions, even if a feature is inert in
  community). So entities are NOT edition-gated; only their *behavior* is.

---

## A. `app.ts` — module imports (the edition switch)
*Seam: Module-registration. These are registered inside the CLOUD/ENTERPRISE/COMMUNITY
switch.*

Each needs a module that still exists as an importable symbol. Two sub-cases:

**A.1 — Rebuild behind a module (community base + full impl):**
| Broken import | Interface needed | Edition seam |
|---|---|---|
| `platformProjectModule`, `platformProjectBackgroundJobs` | multi-workspace mgmt module | registered for all editions (community = single/limited workspace) |
| `projectMemberModule` | membership module | module-reg; community = limited |
| `projectRoleModule` | roles module | module-reg; community = built-in roles only |
| `auditEventModule` | audit module | module-reg (recommend all editions) |
| `apiKeyModule` | management API keys | module-reg |
| `signingKeyModule` | token-signing keys | module-reg (enterprise/cloud) |
| `authnSsoSamlModule` | SAML SP | module-reg (entitlement) |
| `federatedAuthModule` | OAuth/OIDC login | module-reg (entitlement) |
| `otpModule` | OTP flows | module-reg |
| `enterpriseLocalAuthnModule` | enterprise local auth | module-reg |
| `managedAuthnModule` | embed managed auth | module-reg (entitlement) |
| `scimModule` | SCIM 2.0 | module-reg (entitlement) |
| `oauthAppModule` | BYO OAuth apps | module-reg (entitlement) |
| `globalConnectionModule` | org-shared connections | module-reg (entitlement) |
| `appCredentialModule` | embed managed creds | module-reg (entitlement) |
| `connectionKeyModule` | connection keys | module-reg |
| `secretManagersModule` | external secret stores | module-reg (entitlement) |
| `embedSubdomainModule` | custom domains | module-reg (entitlement) |
| `platformWebhooksModule` | org webhook events | module-reg (entitlement) |
| `platformPlanModule`, `platformAiCreditsService` | plans/billing/AI-credits | module-reg + service-interface (cloud/enterprise) |
| `platformPieceModule` | piece governance | module-reg (entitlement) |
| `gitRepoModule`, `projectReleaseModule` | versioning/git-sync | module-reg (entitlement) |
| `chatModule` | agent conversations | module-reg (entitlement) |
| `userModule` | enterprise user-admin endpoints | module-reg |
| `adminPlatformModule`, `adminPlatformTemplatesCloudModule` | super-admin / cloud templates | module-reg (cloud) |

**A.2 — Registry-seam hooks (NOT modules):**
| Broken import | Interface needed | Edition seam |
|---|---|---|
| `projectEnterpriseHooks` | `ProjectHooks` (postCreate, …) | **Registry seam**: `projectHooks.set(...)`. Community already has a base hook; enterprise sets the enhanced one. |
| `enterpriseFlagsHooks` | flags/entitlement hooks | **Registry seam**: `flagHooks.set(...)`. Community = base flags; enterprise = plan-driven. |
| `platformOAuth2Service` (via `setPlatformOAuthService`) | OAuth2 brokering service | **Registry/setter seam** already present. |

**A.3 — Drop (do NOT stub), remove registration entirely:**
| Broken import | Action |
|---|---|
| `appSumoModule` | Remove the import and its `app.register(...)` line. Permanently dropped. |
| `licenseKeysModule` | Remove; replace later with your own entitlement mechanism (spec G.4), not theirs. |

---

## B. `database-connection.ts` — entity imports (EXHAUSTIVE: 19)
*Seam: Entity (NOT edition-gated). Every entity must be registered so schema exists in all
editions; behavior is gated elsewhere. Recreate each as your OWN clean-room entity
(structure derived from your sanitized spec + the MIT shared types/API contract, NOT from
the licensed entity files).*

| # | Broken entity import | Rebuild? | Notes |
|---|---|---|---|
| 1 | `AlertEntity` | Yes | alerting; pairs with email infra |
| 2 | `ApiKeyEntity` | Yes | management API keys |
| 3 | `AppCredentialEntity` | Yes | embed managed credentials |
| 4 | `AppSumoEntity` | **DROP** | drop with its module unless you adopt AppSumo |
| 5 | `AuditEventEntity` | Yes | audit log (all editions) |
| 6 | `OtpEntity` | Yes | OTP codes |
| 7 | `ChatConversationEntity` | Yes | agent conversations |
| 8 | `ConnectionKeyEntity` | Yes | connection keys |
| 9 | `EmbedSubdomainEntity` | Yes | custom domains |
| 10 | `OAuthAppEntity` | Yes | BYO OAuth apps |
| 11 | `ConcurrencyPoolEntity` | Yes | concurrency capacity |
| 12 | `PlatformPlanEntity` | Yes | org plan state |
| 13 | `ProjectMemberEntity` | Yes | membership (core dependency) |
| 14 | `ProjectPlanEntity` | Yes | per-workspace limits |
| 15 | `GitRepoEntity` | Yes | git-sync config |
| 16 | `ProjectReleaseEntity` | Yes | release records |
| 17 | `ProjectRoleEntity` | Yes | roles (core dependency) |
| 18 | `SecretManagerEntity` | Yes | external secret-store config |
| 19 | `SigningKeyEntity` | Yes | token-signing keys |

> Clean-room rule for entities: define each entity's fields from (a) your sanitized
> capability spec, (b) the MIT shared types referenced by the frontend, and (c) the field
> roles the MIT API contract map implies — NOT by reading the deleted licensed entity
> source. Entities are registered unconditionally (schema must exist in every edition); a
> feature being inert in community is enforced by behavior/gating, not by a missing table.

---

## C. `postgres-connection.ts` — migration imports (EXHAUSTIVE: 20)
*Seam: Entity/migration. Do NOT resurrect these licensed migration files — author your own
fresh migrations for the entities you rebuild.*

The 20 removed migrations and the schema concern each represents (for your OWN migrations to
cover — names are historical context only; write fresh files with your own names):

| Migration (historical) | Schema concern your own migration must cover |
|---|---|
| `MakeStripeSubscriptionNullable…` | billing/plan columns (only if you build billing) |
| `AddTemplates…`, `ChangeToJson…`, `AddPinnedAndBlogUrl…`, `AddPinnedOrder…`, `AddProjectIdToTemplate…`, `FlowTemplateAddUserIdAndImageUrl…`, `AddFeaturedDescriptionAndFlagToTemplates…`, `AddMetadataFieldToFlowTemplates…` | template-library schema |
| `AddBillingParameters…`, `ModifyBilling…`, `AddTasksPerDays…`, `RemoveCalculatedMetrics…`, `AddDatasourcesLimit…` | plan/limit/metering schema |
| `AddAppSumo…` | **DROP** (AppSumo dropped) |
| `AddProjectMembers…`, `ProjectMemberRelations…` | membership schema |
| `AddReferral…` | referral schema (build only if wanted) |
| `AddPlatform…` | organization (platform) schema — foundational |
| `AddCustomDomain…` | custom-domain schema |

> **Clean-room rule for migrations:** write brand-new forward migrations whose *up* SQL
> creates the schema your rebuilt entities (B) need. Derive the schema from your entities,
> not from the historical migration bodies. Remove all 20 `../ee/database/migrations/...`
> imports from `postgres-connection.ts`.
> **sqlite-connection.ts:** confirmed it imports **no** `ee/` migrations — nothing to change
> there for migrations.

---

## D. Consumer files — direct service/util imports
*These import a specific EE service/function. Seam: Service-interface (community base +
full impl) unless noted.*

| File | Broken symbol | Interface / action |
|---|---|---|
| `helper/embed-security.ts` | `embedSubdomainService` | service-interface; community = no custom domains (returns null) |
| `workers/rpc/worker-rpc-service.ts` | `chatRpcHandlers` | service-interface; community = no chat handlers |
| `database/seeds/role-seed.ts` | `ProjectRoleEntity` | entity (see B); seed built-in roles |
| `workers/machine/machine-service.ts`, `job-queue/job-queue.ts`, `core/canary/canary-routing.middleware.ts` | `workerGroupService` | service-interface; community = single default group |
| `template/template.service.ts` | `platformTemplateService` | service-interface |
| `template/template.controller.ts` | `platformMustBeOwnedByCurrentUser` | authz guard fn; community = base guard |
| `platform/platform.service.ts` | `invalidateSamlClientCache`, `platformPlanService` | service-interface (SAML cache no-op in community; plan service base) |
| `platform/platform.controller.ts` | `platformToEditMustBeOwnedByCurrentUser`, `platformPlanService`, `stripeHelper`, `platformProjectService` | authz guard + service-interfaces |
| `job-queue/interceptors/rate-limiter-interceptor.ts` | `concurrencyPoolService` | service-interface; community = no concurrency cap |
| `tables/table/table.service.ts` | `projectStateService` | service-interface (versioning) |
| `tables/table/table.controller.ts`, `flows/flow/flow.controller.ts` | `gitRepoService` | service-interface (git-sync) |
| `user-invitations/user-invitation.service.ts` | `smtpEmailSender`, `emailService`, `projectMemberService`, `projectRoleService` | service-interfaces; email is shared infra (build first) |
| `user-invitations/user-invitation.module.ts` | `platformMustBeOwnedByCurrentUser`, `platformMustHaveFeatureEnabled`, `projectMustBeTeamType`, `assertRoleHasPermission`, `projectRoleService` | authz guards + role service |
| `pieces/metadata/utils/index.ts`, `pieces/metadata/piece-metadata-service.ts` | `enterpriseFilteringUtils` | service-interface; community = no filtering (passthrough) |
| `user/user-service.ts` | `platformProjectService`, `projectMemberRepo` | service-interface + repo |
| `flows/flow-run/flow-run-hooks.ts` | `alertsService` | service-interface; depends on email |
| `user/badges/badge-service.ts` | `emailService` | shared infra |
| `flows/flow/flow.controller.ts` | `assertUserHasPermissionToFlow`, `platformPlanService` | **authz seam** (must be always-on per spec I.3) |
| `flags/flag.service.ts` | `federatedAuthnService`, `smtpEmailSender` | service-interfaces |
| `mcp/oauth/mcp-oauth.controller.ts` | `ChatConversationEntity`, `CONVERSATION_ID_HEADER` | entity + const (chat) |
| `mcp/mcp-permissions.ts` | `getPrincipalRoleOrThrow` | **authz seam** (role resolution) |
| `core/websockets.service.ts` | `projectMemberService` | service-interface |
| `core/security/v2/authn/authenticate.ts` | `apiKeyService` | service-interface (API-key auth) |
| `core/security/v2/authz/authorize.ts` | `rbacService`, `projectMemberService` | **authz seam** — central authorization (always-on, spec I.3 Guarantee B) |
| `app-connection/app-connection-service.ts` + `oauth2/oauth2-util.ts` + `app-connection-worker-controller.ts` | `projectMemberService`, `secretManagersService`, `containsSecretManagerReference` | service-interfaces |
| `authentication/authentication.service.ts` | `otpService` | service-interface |
| `ai/ai-provider-service.ts` | `openRouterApi`, `platformPlanService` | service-interfaces (AI/plan) |
| `analytics/platform-analytics.module.ts` | `platformMustHaveFeatureEnabled` | authz guard |

---

## Critical seam — authorization must be ALWAYS-ON

`core/security/v2/authz/authorize.ts` (`rbacService`), `flow.controller.ts`
(`assertUserHasPermissionToFlow`), `mcp-permissions.ts` (`getPrincipalRoleOrThrow`) are the
**authorization** seam. Per spec I.3 Guarantee B, the *base* (community) impl is a real
authorization check (with built-in roles), **not** a permissive no-op. Do not ship a
`return Promise.resolve()` stub here in the final state — temporary scaffolding only.

## Shared infrastructure to build first (unblocks many of the above)

1. **Email** (`emailService`, `smtpEmailSender`) — needed by invitations, alerts, OTP,
   badges. Build first.
2. **Entitlement/flags resolver** (`enterpriseFlagsHooks` seam) — gates everything.
3. **Project roles + members services** — needed by authz, invitations, connections,
   websockets.

## Build-green order (temporary scaffolding)

1. Recreate entities (B) + your own migrations (C) → schema exists.
2. Add service-interface stubs (D) returning safe defaults → imports resolve.
3. Restore `app.ts` switch (A) with stub modules; drop AppSumo/license-keys (A.3).
4. Confirm community build boots.
5. Replace stub bodies with real impls per the sanitized spec, edition-gated, one feature
   at a time (authz first, real — never a permissive stub in final state).

> Note: A.1 list shows the imports captured; `database-connection.ts` (lines 10–23+) and
> `postgres-connection.ts` (lines 5–24) continue beyond the captured window — re-grep
> `/ee/` in those two files for the complete entity/migration set before starting B/C.
