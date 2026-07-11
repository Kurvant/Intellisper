# Capability Specification — Tenancy Core + Enterprise Feature Set

> **LEGAL STATUS — READ FIRST. DO NOT SKIP.**
>
> This document is **DIRTY-SIDE DRAFT INPUT**. It was authored by a party that has had
> access to commercially-licensed source code. It is **NOT yet a clean-room build
> blueprint** and **MUST NOT be handed to the implementing ("clean") team as written.**
>
> Before any implementer uses this:
> 1. An IP attorney must review and sanitize it, confirming it contains only
>    unprotectable functional requirements (ideas, behaviors, external interfaces) and
>    **no protected expression** (no source identifiers, schemas, control flow, or the
>    original's structure/sequence/organization).
> 2. The attorney must separately review the actual commercial `LICENSE` text, which
>    (a) forbids copy/distribute/**sell** of the licensed software, and (b) claims that
>    any modifications/patches you make to it remain the licensor's property. This means
>    **independent creation with no access is the only route to a sellable result.**
> 3. The team that implements from this spec must be **disjoint** from anyone (human or
>    AI session) that read the licensed source — including the session that produced this
>    document.
> 4. The licensed source must be **quarantined** out of the clean team's working tree and
>    reference materials.
>
> This document deliberately describes **WHAT** the system must do and **WHY**, at the
> level of externally-observable behavior and contracts. It intentionally omits the
> licensed code's names, table/column layouts, query construction, module decomposition,
> and any expressive choices. Where it references integration points, those are confined
> to **permissively-licensed (open-source / MIT) host code** that the clean team is free
> to read directly; the clean team should confirm those seams against the open-source
> code itself, not against this document.
>
> Functional knowledge (ideas, methods of operation, interfaces required for
> interoperability) is not protected by copyright. This spec stays on that side of the
> line. **Clean room is no defense against patents** — counsel must separately clear
> patent risk.

---

## 0. How to read this spec

- **MUST / SHOULD / MAY** are requirement strengths.
- Each capability is described by: *Purpose*, *Behavioral requirements*, *Inputs/Outputs
  (contracts)*, *Tenancy & access rules*, *Failure behavior*, and *Integration boundary*
  (what the surrounding open-source host expects, behaviorally).
- The spec does **not** prescribe table names, column names, function names, file layout,
  or algorithms. Implementers choose their own. Where a data attribute is required, it is
  described by its *role*, not a column name.
- "Host" = the surrounding permissively-licensed automation platform the new code plugs
  into. "Tenant" concepts are defined in Part I and reused throughout.

---

# PART I — TENANCY CORE (the foundation; specify and build first)

This is the load-bearing domain. Everything in Part II binds to it. Build and stabilize
this before anything else.

## I.1 Tenancy model — concepts and required relationships

The system MUST support a **three-tier ownership hierarchy**:

1. **Organization tier** (the tenant root / billing-and-policy boundary).
2. **Workspace tier** (a container of automation work, owned by exactly one organization).
3. **Membership tier** (a user's association with a workspace, carrying a role).

Required relationships and rules:

- An **Organization** MUST have exactly one **owner** user. Deleting that owner MUST be
  prevented while the organization exists (ownership is a hard constraint, not optional).
- A **Workspace** MUST belong to exactly one organization and MUST record an owning user.
- A workspace MUST carry a **type** distinguishing at least: a *personal* workspace
  (auto-created for an individual) and a *shared/team* workspace (created administratively).
- A workspace MUST support an optional **external identifier** — an opaque string the
  operator/embedding host assigns to map their own entity to this workspace. External
  identifiers MUST be unique within an organization (ignoring soft-deleted workspaces).
- A workspace MUST support **soft deletion** (a reversible "marked deleted" state distinct
  from physical removal) and an optional free-form **metadata** bag.
- **All workload data** (automations, stored credentials, folders, files, tabular data,
  trigger event records, and similar) MUST be owned by a workspace. Tenancy isolation is
  achieved by every workload record being attributable to exactly one workspace, and
  through it to exactly one organization. (Implementers choose the isolation mechanism —
  see I.8 — but the *attribution* requirement is mandatory.)

> **Why:** this hierarchy is what makes the product multi-tenant. The org tier is where
> policy, branding, auth configuration, plans, and entitlements live; the workspace tier
> is where actual work and access control live; membership is the user↔workspace grant.

## I.2 The request identity token ("principal") — the enforcement contract

Every authenticated operation MUST execute under a typed **principal** that carries the
caller's identity *and* their tenancy scope. This is the single source of truth for
"who is acting and within which tenant." The system MUST NOT derive tenancy scope from
request bodies or client-supplied parameters; it MUST derive it from the principal.

The principal model MUST distinguish at least these caller kinds, each with the scope it
is allowed to carry:

| Caller kind | Carries | Notes |
|---|---|---|
| Interactive user | user id + organization id (+ a session-version marker) | normal logged-in user |
| Service/API caller | service-key id + organization id | programmatic org-scoped access |
| Execution engine/worker-for-a-run | run identity + workspace id + organization id | a job executing one workspace's work |
| Unauthenticated / onboarding / generic worker | identity only, **no tenant scope** | MUST be denied tenant-scoped access |

Required behaviors:

- The principal MUST be produced at authentication time and be tamper-evident
  (cryptographically signed if transmitted as a token).
- The principal MUST include a **session-invalidation marker** for interactive users:
  a value stored on the user's identity that, when rotated, invalidates all previously
  issued sessions for that identity. The system MUST support rotating this marker (e.g.
  on security events, ownership changes, or admin action) to force global re-authentication.
- Engine/run principals MUST be bound to exactly one workspace; the system MUST reject any
  attempt by such a principal to act on a different workspace than the one it is bound to.
- Service principals are organization-scoped, not workspace-scoped; access to a specific
  workspace MUST be validated as "does this workspace belong to the service caller's
  organization."

> **Why:** centralizing tenancy in a signed principal is what prevents cross-tenant access
> via parameter tampering. This contract is referenced by nearly every other capability.

## I.3 Access enforcement — two independent layers

The system MUST enforce tenancy isolation and authorization as **two separate layers**,
both of which MUST be active in any edition intended for sale (see the explicit warning at
the end of this section).

### Layer A — Tenant data scoping (always on, every edition)

- Every read/query for workload or workspace data MUST be constrained so a caller can only
  retrieve records within their tenant scope.
- For listing workspaces, the rule MUST be:
  - A **privileged organization administrator** sees all workspaces in their organization.
  - A **non-privileged user** sees only: (a) their own personal workspace, and (b) shared
    workspaces in which they hold a membership.
- This scoping MUST be applied uniformly and centrally so that individual endpoints cannot
  accidentally omit it. (Implementer's choice of mechanism; a missed scope check is a
  cross-tenant data leak, so prefer a mechanism that fails safe — see I.8.)

### Layer B — Role/permission authorization (the enterprise overlay)

- For a given route/action that targets a specific workspace, the system MUST determine the
  caller's role within that workspace, resolve that role to a permission set, and verify the
  action's required permission is present. Absence ⇒ permission-denied.
- Per-caller-kind rules:
  - Interactive user ⇒ resolve membership role → permission check.
  - Engine/run principal ⇒ allowed only if it targets its bound workspace.
  - Service principal ⇒ allowed only if the target workspace is within its organization.
  - Unauthenticated / generic worker / onboarding ⇒ denied for tenant-scoped actions.
- Authorization MUST support **action-level granularity** finer than the route — e.g.,
  editing an automation's structure vs. changing its run/enabled status MUST be able to
  require different permissions.

> **CRITICAL DESIGN CORRECTION (do this differently from the reference system):**
> In the reference system, Layer B is *disabled* in the free edition, so any member
> effectively had full rights within visible workspaces. **For a product you intend to sell
> as self-hosted enterprise, Layer B MUST be always-on**, not edition-gated, or the
> enterprise security guarantee is silently void. Make the permission layer a first-class
> always-present component; vary *which roles/permissions exist* by plan, not *whether
> authorization runs*.

## I.4 Roles & permissions

- The system MUST support **named roles** scoped to an organization, each holding a set of
  discrete **permissions**.
- The system MUST ship a set of **built-in default roles** spanning a spectrum from full
  administrative control down to read-only. (Implementer defines the exact catalog; a
  typical spectrum: administrator, editor, operator, viewer.)
- Enterprise capability: organizations MUST be able to define **custom roles** (create /
  read / update / delete) with chosen permission subsets, subject to plan entitlement.
- A **membership** record MUST associate (user, workspace, organization, role) and MUST be
  unique per (user, workspace) within an organization.
- The permission catalog MUST be expressive enough to gate at least: workspace management,
  automation read/write, automation run-status changes, connection management, member
  management, role management, and the enterprise features in Part II. (Implementer derives
  the full enumeration from the feature set; do not copy any existing enumeration.)

## I.5 Workspace lifecycle & orchestration

### Creation
- Creating a shared workspace MUST be **atomic**: the workspace and its initial
  plan/limit/quota record MUST be created together (all-or-nothing). Side effects that can
  fail independently (e.g., notifications, optional connection attachment) MUST run *after*
  the atomic core, and their failure MUST NOT corrupt the workspace.
- Creation MUST run through an **extension hook** (see I.7) so that edition/plan-specific
  side effects are injected rather than hard-coded.

### Update
- Updating a workspace MUST support: display attributes, external identifier (re-validating
  uniqueness), concurrency limit (see Part II concurrency), plan/limit fields, and
  attachment/detachment of org-shared connections — performed atomically where multiple
  records change together.

### Deletion
- Deletion MUST be **two-phase**: (1) immediate **soft delete** (workspace becomes
  invisible/unusable but recoverable), then (2) an **asynchronous, retried background job**
  that performs the expensive cascade removal of all child workload data.
- The async cleanup MUST be **idempotent and retry-safe** (it touches many child data types;
  partial failure must be resumable). Specify generous retry with backoff.

### Listing
- Workspace listing MUST be **cursor-paginated** and MUST apply Layer-A scoping (I.3).
- Listing MUST support resolving "on behalf of an external user identifier," but **only for
  service principals** (the embedding/API use case). Interactive callers MUST NOT be able to
  impersonate other users via an external-id parameter.

### Bootstrap (first run)
- On first use with no organization yet, the system MUST create: the first user as an
  organization administrator, their organization, and a personal workspace — as a single
  coherent bootstrap path.

## I.6 Enrichment / reporting derived data
- When presenting workspaces administratively, the system MUST be able to enrich each with
  derived counts (e.g., member count, active-member count, total/active automation counts)
  and the workspace's plan/limit snapshot. These are **read-time aggregations**, not stored
  authoritative state.

## I.7 The extensibility seam (replace edition `if`-branches with injection)

- Behavior that differs by edition/plan (e.g., what happens after a workspace is created,
  which features are enabled) MUST be expressed through **named extension points
  (hooks/strategies)** with a default ("base") implementation and an override
  ("enterprise/plan") implementation, selected at startup based on the running edition/plan.
- At minimum, the system MUST provide:
  - a **post-workspace-creation hook** (base = no-op; enterprise = e.g. register a default
    alert recipient), and
  - a **feature-flag/entitlement resolver** hook (base = community defaults; enterprise =
    plan-driven feature enablement).
- **Why:** this avoids scattering `if (edition === …)` throughout the codebase and is the
  clean, maintainable way to differentiate self-hosted/community vs. enterprise vs. cloud.
  Keep authorization (I.3 Layer B) *out* of this gating — it is always on.

## I.8 Tenancy isolation strategy — an explicit decision the team MUST make

The reference system uses **application-layer row scoping only** (every record attributed to
a workspace; queries filtered in code). That is the simplest model but means a single missed
filter is a cross-tenant leak. For a paid multi-tenant cloud, the team MUST consciously
choose one of:

- **(a) Application-layer scoping only** — simplest; highest discipline burden.
- **(b) Application-layer scoping + database row-level security** — defense-in-depth; a
  missed app filter still cannot leak across tenants. **Recommended for the cloud offering.**
- **(c) Schema-per-tenant or database-per-tenant** — strongest isolation; largest
  operational and migration cost.

The spec REQUIRES that whichever is chosen, the *attribution* rule of I.1 holds and Layer-A
scoping of I.3 is centralized and fail-safe.

## I.9 Integration boundary with the open-source host (behavioral)

> The clean team should confirm these against the **permissively-licensed** host code
> directly. They are stated behaviorally so this document carries no protected expression.

The new tenancy core MUST satisfy the following contracts the host relies on:

- **Identity/token issuance & verification:** the host authenticates requests and expects a
  typed principal (I.2) to be available on each request; the new code MUST integrate with the
  host's authentication/token lifecycle and produce principals in the shape the host's
  request pipeline consumes.
- **Workspace resolution for execution:** the host's execution/worker subsystem and its
  inbound event/webhook handling need to resolve "which organization owns this workspace" for
  a given workspace id. The new code MUST provide that lookup.
- **Persistence registration:** the host wires entities into a shared data layer at startup;
  any new persistent types MUST be registered through that same mechanism so schema
  creation/migration includes them. (If new types are not registered, the host's data layer
  and migrations will be incomplete — a build/runtime break. This is the single most common
  integration failure; treat it as a release gate.)
- **Migrations:** schema for all new persistent types MUST ship as host-compatible
  migrations that run on startup; provide forward migrations and test them on a populated
  database before release.
- **Startup registration of modules & hooks:** new feature modules and the hook
  implementations of I.7 MUST be registered at application startup in the host's module
  registration phase, conditioned on edition/plan.

## I.10 Tenancy core — acceptance criteria (definition of done)

- [ ] A user with no org can bootstrap: becomes org admin, gets an org + personal workspace.
- [ ] Cross-tenant access is impossible via parameter tampering (verified by test: a
      principal of org A cannot read/write any record of org B by id).
- [ ] Layer-A listing rules hold for admin vs. non-privileged member.
- [ ] Layer-B authorization is enforced for every tenant-scoped action and is **on in all
      sellable editions**; action-level granularity works.
- [ ] Engine/run principal cannot act outside its bound workspace; service principal cannot
      act outside its organization.
- [ ] Session-invalidation marker rotation forces global re-auth.
- [ ] Workspace create is atomic; delete is soft-then-async-cascade and idempotent.
- [ ] External-id resolution works for service principals only.
- [ ] New entities are registered with the host data layer and covered by tested migrations;
      app builds and boots with no missing-schema errors.
- [ ] Chosen isolation strategy (I.8) implemented and documented.

---

# PART II — ENTERPRISE FEATURE SET (behavioral specs; each binds to Part I)

Each item below is what to build, why, and the tenancy/contract rules — **no reference
identifiers or code structure.** Group ordering reflects sensible build order
(shared dependencies first). Items marked **(plan-gated)** are enabled per entitlement
via the I.7 resolver; **authorization (I.3 Layer B) is never plan-gated.**

## Group 1 — Shared infrastructure (build early; others depend on these)

**1. Transactional email / outbound messaging.**
- *Purpose:* deliver invitations, alerts, verification codes, password resets.
- *Requirements:* pluggable senders (at least: real SMTP-style delivery, and a no-op/log
  sender for dev). Configurable sender identity/branding. MUST degrade safely (a delivery
  failure must not crash the triggering operation).
- *Dependency note:* invitations, alerts, and OTP all depend on this — build it first.

**2. Feature entitlement / flag resolution (the I.7 resolver, concretely).**
- *Purpose:* decide which capabilities are on for a given organization/plan/edition.
- *Requirements:* central resolver; per-org overrides; safe defaults; consulted by UI and
  server. MUST NOT be the mechanism that gates authorization.

**3. Signing key management. (plan-gated)**
- *Purpose:* asymmetric key pairs an organization uses to sign tokens for embedding and SSO
  handshakes.
- *Requirements:* generate key pairs; store private material securely (encrypted at rest);
  expose public material for verification; support multiple keys and rotation; org-scoped.

**4. Audit logging.**
- *Purpose:* tamper-evident record of security/governance-relevant events (logins, member
  and role changes, connection changes, releases, key events) — compliance prerequisite.
- *Requirements:* append-only event records attributed to org/workspace/actor; queryable
  with filters and pagination; retention controls. SHOULD be always available (not merely
  plan-gated) since it underpins compliance claims.

## Group 2 — Identity, authentication & access (binds to I.2/I.3/I.4)

**5. Enterprise local authentication.**
- Email/password flows beyond the community baseline (e.g., admin-provisioned accounts,
  password policy, domain restrictions on who may register).

**6. One-time-code (OTP) flows.**
- *Purpose:* email verification and password reset via short-lived single-use codes.
- *Requirements:* generate, store hashed with expiry, single-use, rate-limited; delivered via
  Group-1 email. Bind to a purpose (verify vs. reset) so codes aren't cross-usable.

**7. SSO via SAML 2.0. (plan-gated)**
- *Purpose:* let an org's users authenticate through their corporate IdP.
- *Requirements:* act as a SAML service provider; consume IdP metadata; validate signed
  assertions; map IdP attributes → local user profile; bind login to the org by verified
  email domain; provision/link users on first login. Use a vetted SAML library; do not
  hand-roll XML signature validation. Build to the **public SAML 2.0 spec** (a clean input).

**8. Federated / social SSO (e.g., Google). (plan-gated)**
- OAuth/OIDC-based login with at least one major provider; map provider identity → local
  user; link to org by domain rules. Build to the **public OAuth2/OIDC specs**.

**9. Externally-managed authentication (for embedding). (plan-gated)**
- *Purpose:* let an embedding host authenticate *its* end-users into the platform without
  those users having native accounts.
- *Requirements:* accept a host-signed token (verified via the org's signing key, item 3),
  extract an external user identifier, and provision/resolve a corresponding scoped user
  on demand. This is the consumer of the service-principal external-id resolution (I.5).

**10. SCIM 2.0 directory provisioning. (plan-gated)**
- *Purpose:* automatic user/group lifecycle sync from an IdP.
- *Requirements:* implement the **public SCIM 2.0 protocol** (discovery, users, groups
  endpoints) scoped to an organization; create/update/deactivate users and map groups →
  roles/memberships. Build strictly to the published SCIM spec (clean input).

**11. Organization-ownership / privileged-action guards.**
- Central guards asserting "caller is the org owner / privileged admin" for org-level
  operations, layered on I.2/I.3.

## Group 3 — Workspace-adjacent management (binds to I.5)

**12. Multi-workspace management. (plan-gated)**
- CRUD and administration of multiple shared workspaces under one organization, honoring
  I.5 lifecycle and plan limits.

**13. Workspace membership management.**
- Invite (via Group-1 email), accept, list, update role, and remove members; uniqueness per
  (user, workspace); drive Layer-B role resolution.

**14. Per-workspace plans / quotas. (plan-gated)**
- Configurable limits per workspace (e.g., allowed pieces/integrations, feature toggles);
  consulted at create/update and at enforcement points.

**15. Custom roles CRUD. (plan-gated)** — see I.4 (the org-defined-roles capability).

**16. Release management & environment promotion + state diffing. (plan-gated)**
- *Purpose:* version-control automations and promote them between environments (e.g., via a
  git-backed sync), with a computed diff between the current workspace state and a target.
- *Requirements:* serialize workspace automation state to a portable form; push/pull to an
  external VCS; compute structural diffs; apply a target state transactionally with rollback
  on failure. Sensitive material (credentials) MUST NOT be exported in clear.

## Group 4 — Platform/org administration, billing, capacity

**17. Organization administration & super-admin operations.**
- Org listing/management; cross-org administrative operations restricted to a super-admin
  role; an org-scoped template library administration surface.

**18. Concurrency limits / pools. (plan-gated)**
- *Purpose:* cap simultaneous executions per org/workspace.
- *Requirements:* define named capacity pools with a max-concurrent value; assign workspaces
  to pools; the execution subsystem MUST consult the pool before dispatching runs. Integrates
  with the host's execution/worker subsystem (behavioral contract only).

**19. Plans & billing. (plan-gated)**
- *Purpose:* subscription plans, metering, and payment.
- *Requirements:* plan definitions and per-org plan state; usage metering; integration with a
  payment processor for checkout/subscription lifecycle and webhook handling. **Build your
  own billing model and processor integration** — do not reuse the reference's processor
  wiring or any third-party redemption integrations you don't need.

**20. AI credit metering & managed model-provider access. (plan-gated)**
- *Purpose:* meter AI usage in credits and broker model-provider access so end-users don't
  supply their own keys.
- *Requirements:* per-org credit balance and decrement on use; a server-side proxy to model
  providers using org/operator-held keys; provisioning of provider access. Default to current
  top-tier models; keep provider keys server-side only (never sent to clients). *(Per project
  memory: prefer Anthropic Claude models — latest Opus/Sonnet/Haiku — as the default.)*

**21. Dedicated worker grouping. (plan-gated)**
- Ability to route an org's executions to a dedicated set of workers/capacity. Behavioral
  contract with the host execution subsystem.

## Group 5 — Connections, credentials, secrets

**22. Organization-shared ("global") connections. (plan-gated)**
- Connections defined once at the org level and attachable to multiple workspaces; attach/
  detach is part of workspace create/update (I.5). Attribution and scoping per Part I.

**23. Platform-level OAuth connection brokering. (plan-gated)**
- Server-side OAuth2 authorization-code handling on behalf of workspace connections, so
  end-users connect third-party apps without seeing client secrets.

**24. Custom OAuth applications ("bring your own OAuth"). (plan-gated)**
- Let an org register its own OAuth client credentials per provider, used in place of the
  platform defaults.

**25. Managed connection credentials for embedding. (plan-gated)**
- Org-managed credential records used to pre-provision connections in embedded contexts.

**26. Connection-key API. (plan-gated)**
- Programmatic keys for managing connections externally. *(Reference had this only partially
  implemented; specify it fully or defer explicitly.)*

**27. External secret-manager backends. (plan-gated)**
- *Purpose:* source secrets from enterprise secret stores rather than the platform DB.
- *Requirements:* pluggable provider interface with adapters for major managers (e.g.,
  cloud-native secret stores and self-hosted vaults); cache with sane TTL; per-org config;
  fail-safe (a provider outage must produce a clear error, not a silent empty secret). Build
  adapters against each vendor's **public SDK/API** (clean input).

## Group 6 — Pieces/integration governance, branding, custom domains

**28. Private / filtered integrations governance. (plan-gated)**
- Per-org control over which integrations ("pieces") are available: allow/deny lists,
  pinning, and private (org-only) integrations. Enforced at listing and at use.

**29. Custom domains / subdomains. (plan-gated)**
- *Purpose:* serve an org's instance under its own domain (white-label).
- *Requirements:* register/verify domains; integrate with a CDN/edge provider's custom-
  hostname API; route requests for a custom hostname to the correct org context. Build
  against the CDN provider's **public API** (clean input).

**30. White-label branding/theming. (plan-gated)**
- Per-org logos, colors, names, and appearance surfaced to UI and emails. Bind to org policy
  (I.1) and the email sender (item 1).

## Group 7 — Notifications & comms

**31. Failure/threshold alerting.**
- *Purpose:* notify recipients on automation failures or threshold breaches.
- *Requirements:* per-workspace alert recipients/channels (email via item 1); de-duplication;
  the post-workspace-creation hook (I.7) MAY register a default recipient. Depends on email.

**32. Platform-level webhook events. (plan-gated)**
- Emit org-level event notifications to operator-configured endpoints (signed payloads).

## Group 8 — AI chat / agent conversations

**33. AI chat / agent conversation layer. (plan-gated)**
- *Purpose:* conversational agent sessions with persistence and governance.
- *Requirements:* persistent conversations scoped to org/workspace/user; **approval gates**
  for sensitive/irreversible agent actions (human-in-the-loop confirm before execute);
  **history management** — summarization/compaction of long histories and hygiene/retention
  of stored conversation data; background synchronization of conversation state. Integrates
  with item 20 (AI credits/provider proxy). Approval-gate semantics are a safety requirement,
  not optional.

## Group 9 — Embedding client SDK

**34. White-label embedding SDK (client library).**
- *Purpose:* embed the builder UI inside a third-party web app.
- *Requirements:* a browser SDK that (a) mounts the app in an iframe, (b) defines a
  **bidirectional message protocol** between host page and embedded app (a documented set of
  event/command names and payloads — define your own vocabulary), (c) performs a
  managed-auth handshake using a host-signed token (items 3 & 9), and (d) controls
  navigation and theming from the host. Publish your own protocol; do not reproduce the
  reference SDK's event names or message shapes.

## Group 10 — Templates, user admin, and explicit drops

**35. Org-scoped template library. (plan-gated)**
- Manage and serve automation templates within an organization.

**36. Enterprise user-administration endpoints.**
- Org/admin user management surfaces (current-user profile, platform user admin), layered on
  Part I identity and authorization.

**37. License/entitlement enforcement (REPLACE, don't reimplement).**
- Do **not** reproduce the reference's licensor-key validation. For self-hosted enterprise,
  design **your own** entitlement mechanism (e.g., signed offline-verifiable entitlement
  tokens) — note that any sellable self-hosted product needs *some* tamper-resistant
  entitlement check or it is freely copyable. Counsel + product decision.

**38. Redemption/marketplace billing integrations — DROP unless needed.**
- The reference's third-party redemption integration is almost certainly irrelevant; omit.

**39. Usage/console metering & reporting (OPTIONAL).**
- Platform usage/console reporting existed upstream but not in the current fork. Build only
  if your product needs operator-facing usage dashboards; spec from your own requirements.

---

## PART III — Cross-cutting requirements (apply to all of the above)

- **Persistence registration & migrations:** every new persistent type MUST be registered
  with the host data layer and covered by tested, forward-only migrations that run at
  startup. *Release gate:* the app must build and boot with no missing-schema errors. (This
  is the most common integration break — see I.9.)
- **Startup module/hook registration:** new modules and the I.7 hook implementations MUST be
  registered in the host's startup phase, conditioned on edition/plan.
- **Encryption at rest & key management:** all stored secrets (connection credentials, signing
  private keys, provider keys) MUST be encrypted at rest; specify key management and rotation.
- **Fail-safe defaults:** scoping/authorization/secret-fetch failures MUST deny or error,
  never silently grant or return empty-as-success.
- **Always-on authorization:** reiterate — Layer B (I.3) is never plan-gated in a sellable
  edition.
- **Observability:** every capability SHOULD emit structured logs and metrics for security
  and ops; security-relevant events flow to audit logging (item 4).
- **Test coverage:** each capability ships with cross-tenant isolation tests proving a
  principal of one tenant cannot reach another tenant's data through that capability.

---

## PART IV — Clean inputs the implementing team MAY use freely

These are non-contaminating reference sources (public standards / permissively-licensed /
vendor docs). Prefer building from these over any description in this document:

- Public protocol specs: **SAML 2.0, OAuth 2.0 / OIDC, SCIM 2.0, JWT/JWS**.
- Vendor public SDKs/APIs for: payment processor, CDN custom-hostname, secret managers,
  model providers, VCS hosting.
- The **permissively-licensed (open-source) host code** itself, for the integration
  boundaries in I.9 (the clean team reads the open-source code directly to confirm the
  contracts; they MUST NOT read the commercially-licensed source).

---

## PART V — Process gate (non-code; required before implementation)

1. **Attorney review** of this document → sanitized spec (remove anything counsel flags as
   protected expression; confirm functional-only).
2. **Attorney review** of the commercial `LICENSE` text and any applicable terms.
3. **Patent clearance** (clean room does not cover patents).
4. **Team separation:** implementers must be disjoint from anyone/any AI session that read
   the commercial source. Document the wall.
5. **Quarantine** the commercial source out of the clean working environment.
6. **Provenance records:** keep dated records of who saw what and which clean inputs were
   used, to evidence independent creation if challenged.

*End of draft. This document is dirty-side input pending attorney sanitization. It is not a
clearance to implement.*