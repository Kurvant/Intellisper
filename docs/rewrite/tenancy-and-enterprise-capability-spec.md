# Multi-Tenant Automation Platform — Capability & Requirements Specification

## About this specification

This document specifies the product requirements for a multi-tenant workflow-automation
platform offered in three deployment shapes: **self-hosted community**, **self-hosted
enterprise**, and a **multi-tenant managed cloud**.

It is an **independently-authored forward specification**. It expresses the author's own
functional synthesis of a multi-tenant automation product, drawn from general industry
patterns and public protocol standards. It is organized for clarity of requirements, not to
mirror any particular system's internal structure. It describes the product as a **black
box**: the externally-observable behavior, the data relationships visible at the domain
level, the public-interface contracts, and the guarantees the system must uphold. It does
**not** prescribe internal code organization, storage layouts, identifiers, runtime
mechanisms, or algorithms — all of which are the implementer's free choices.

Requirement strengths use **MUST / SHOULD / MAY** (RFC 2119 sense). Each capability is
described in terms of *Purpose*, *Observable behavior / guarantees*, *Interface contract*,
and *Tenancy & access rules* where relevant. Where a data attribute is required, it is named
only by its **role**.

Reading guide: **Part I (Tenancy Foundation)** is load-bearing and SHOULD be implemented
first; everything in **Part II** depends on it. **Part III** lists cross-cutting
requirements. **Part IV** lists public, reusable inputs. **Part V** is the
definition-of-done.

Where a recognized open protocol governs a capability (authentication federation, directory
provisioning, token signing, and the like), the implementation MUST conform to that public
protocol specification as its authority.

**A note on platform integration.** This new functionality is intended to run as an
extension of an existing, separately-licensed automation platform ("the platform"). This
specification treats the platform as an external system reached only through its **public
extension contracts**. Wherever integration is required, the implementer determines the
exact contract by consulting the platform's own publicly-available materials and code under
that platform's license — this specification only states *that* a contract must be satisfied
and *what behavior* it must provide, never the platform's internal design.

---

# PART I — TENANCY FOUNDATION

## I.1 Tenancy model — entities and relationships

The platform MUST implement a **three-tier ownership hierarchy**:

1. **Organization** — the tenant root: the boundary for policy, branding, authentication
   configuration, plans, and entitlements.
2. **Workspace** — a container of automation work, belonging to exactly one organization.
3. **Membership** — a user's association with a workspace, carrying a role.

Required relationships and invariants (these are observable guarantees, not storage
prescriptions):

- An **Organization** MUST have exactly one designated **owner** user, and the system MUST
  prevent removal of that owner while the organization exists.
- A **Workspace** MUST belong to exactly one organization and MUST record an owning user.
- A workspace MUST carry a **kind** distinguishing at least an *individual* workspace
  (established automatically for a single user) from a *shared* workspace (established by an
  administrator for a team).
- A workspace MUST support an optional **external reference** — an opaque identifier an
  operator or embedding host assigns to correlate the workspace with an entity in their own
  system. External references MUST be unique within an organization, disregarding workspaces
  in a removed state.
- A workspace MUST support a **recoverable-removed** state (logically removed yet restorable,
  distinct from permanent deletion) and an optional free-form **metadata** attribute.
- **All workload data** the platform manages on a user's behalf MUST be attributable to
  exactly one workspace, and through it to exactly one organization. This attribution is the
  basis of tenant isolation (see I.8).

> **Why:** the three tiers separate concerns — the organization holds policy and commercial
> state, the workspace holds work and access control, and membership is the user-to-workspace
> grant. This separation is what makes the product safely multi-tenant.

## I.2 Request identity ("principal") — the scope-bearing contract

Every authenticated operation MUST execute under a typed **principal** conveying both the
caller's identity **and** the tenant scope the caller may act within. The principal MUST be
the authoritative source of tenant scope. The system MUST NOT infer tenant scope from
client-supplied parameters or request bodies.

The principal model MUST distinguish at least the following caller categories, each carrying
only the scope appropriate to it:

| Caller category | Scope it conveys |
|---|---|
| Interactive user | user identity + organization + a session-revocation marker |
| Programmatic/service caller | service-credential identity + organization |
| Automation-execution context | execution identity + a single bound workspace + organization |
| Unauthenticated / pre-onboarding / infrastructure | identity only, **no tenant scope** |

Required guarantees:

- The principal MUST be established at authentication time and MUST be tamper-evident; when
  transmitted as a token it MUST be cryptographically verifiable.
- The user identity MUST support a **session-revocation marker** whose change invalidates all
  previously issued sessions for that identity. Changing this marker MUST force the user to
  re-authenticate everywhere.
- An execution-context principal MUST be confined to its single bound workspace; any attempt
  by it to act on a different workspace MUST be rejected.
- A service/programmatic caller is organization-scoped; access to a specific workspace MUST
  be validated as that workspace belonging to the caller's organization.

> **Why:** anchoring tenant scope in a verifiable principal — rather than in request inputs —
> is the primary defense against cross-tenant access through parameter manipulation.

## I.3 Access enforcement — two required guarantees

The platform MUST enforce tenancy and authorization as **two distinct, independently correct
guarantees**, both present and active in every edition the product is sold in.

### Guarantee A — Tenant scoping (universal)

- Any retrieval of workspace or workload data MUST return only records within the caller's
  permitted tenant scope.
- When enumerating workspaces:
  - A **privileged organization administrator** MUST be able to see all workspaces in their
    organization.
  - A **non-privileged user** MUST see only the workspaces they own individually plus the
    shared workspaces in which they hold a membership.
- This scoping MUST hold **uniformly across every access path** — it MUST NOT be possible for
  any single interface to return out-of-scope data. The guarantee MUST fail safe: when scope
  cannot be determined, access is denied rather than broadened.

### Guarantee B — Authorization (role/permission)

- For any action targeting a specific workspace, the system MUST resolve the caller's role
  within that workspace, expand it to a permission set, and confirm the action's required
  permission is granted. A missing permission MUST result in denial.
- Per caller category:
  - Interactive user ⇒ resolve membership role, then permission check.
  - Execution context ⇒ permitted only against its single bound workspace.
  - Service/programmatic caller ⇒ permitted only when the target workspace is within its
    organization.
  - Unauthenticated / infrastructure / pre-onboarding ⇒ denied for any tenant-scoped action.
- Authorization MUST support **granularity finer than a single interface**: distinct
  operations on the same resource (for example, editing an automation's definition versus
  toggling its enabled/run state) MUST be able to require different permissions.

> **Mandatory product rule:** authorization (Guarantee B) MUST be enforced at all times in
> every sellable edition; it MUST NOT be conditional on plan or edition. Editions/plans MAY
> vary *which roles and permissions are configurable*, but MUST NEVER vary *whether
> authorization is evaluated*. This is required for the enterprise security guarantee to
> hold.

## I.4 Roles & permissions

- The system MUST support **named roles**, each holding a set of discrete **permissions**,
  defined within the scope of an organization.
- The system MUST provide **built-in roles** spanning from full administrative authority to
  read-only observation. (The implementer defines the catalog; a conventional set is
  administrator, editor, operator, viewer.)
- Organizations MUST be able to define **custom roles** with chosen permission subsets
  (create, read, update, delete), available subject to entitlement.
- A **membership** MUST bind (user, workspace, organization, role) and MUST be unique per
  (user, workspace) within an organization.
- The permission vocabulary MUST be rich enough to gate, at minimum: workspace
  administration; automation read and write; automation run-state changes; connection and
  credential management; member management; role management; and each governed capability in
  Part II. The implementer defines the concrete enumeration from the product's own feature
  set.

## I.5 Workspace lifecycle (observable guarantees)

### Establishment
- Establishing a shared workspace MUST be **all-or-nothing** with respect to the workspace
  and any mandatory companion records (for example, its initial plan/limit record): on
  failure, no partial workspace exists.
- Best-effort side effects that may fail independently (notifications, optional connection
  attachment) MUST NOT be able to leave the workspace in a corrupt or partial state; a valid
  workspace MUST result regardless of such a side effect's outcome.
- Establishment MUST be **extensible** so additional edition- or plan-specific behavior can
  be attached without altering the core establishment behavior (see I.7).

### Modification
- Updating a workspace MUST support, at minimum: display attributes; the external reference
  (re-validating uniqueness on change); concurrency capacity (see Part II); plan/limit
  attributes; and association/disassociation of organization-shared connections. A single
  update that changes multiple records MUST be all-or-nothing.

### Removal
- Removal MUST be observable in **two stages**: the workspace becomes immediately
  unusable-but-restorable (recoverable-removed), after which all of its dependent data is
  **eventually and completely** removed.
- The dependent-data removal MUST complete reliably even if interrupted or repeated — it MUST
  be safely repeatable and leave no partial residue. (How completion is achieved is the
  implementer's choice.)

### Enumeration
- Workspace enumeration MUST be **paginated for stable iteration over large result sets** and
  MUST apply Guarantee A (I.3).
- Enumeration MUST support resolving results on behalf of an **external user reference**, but
  **only** for service/programmatic callers. Interactive callers MUST NOT be able to act as
  another user through such a parameter.

### First-run establishment
- On first use of a fresh deployment with no organization present, the system MUST establish,
  as one coherent outcome: the initial user as an organization administrator, that user's
  organization, and an initial individual workspace.

## I.6 Administrative reporting views
- For administrative presentation, the system MUST be able to present, per workspace,
  **derived metrics** — for example, member counts (total and recently active) and automation
  counts (total and active) — alongside the workspace's current plan/limit snapshot. These
  are computed views, not authoritative stored state.

## I.7 Edition/plan variability

- Behavior that legitimately differs by edition or plan (for example, what additional effects
  accompany workspace establishment, or which capabilities are available) MUST be expressed
  through **well-defined variation points** — a base behavior plus an enhanced behavior, with
  the deployment's edition/plan determining which is in effect.
- The system MUST provide at least:
  - an **establishment variation point** (base: no additional effect; enhanced: e.g. register
    a default alert recipient), and
  - an **entitlement resolver** variation point (base: the base capability set; enhanced:
    plan-driven capability availability).
- This keeps edition/plan differences contained in well-defined, interchangeable units rather
  than diffused through general logic; the product behaves identically across editions except
  for the selected variation.
- Authorization (I.3 Guarantee B) MUST NOT be expressed through this variability mechanism; it
  is always enforced.

## I.8 Tenant isolation strategy — a required design decision

Tenant isolation can be achieved at different layers with different strength/cost trade-offs.
The team MUST consciously select and document one of the following, consistent with the
attribution invariant of I.1 and the fail-safe scoping of I.3:

- **(a) Application-level scoping** — tenant attribution on every record, enforced by
  centralized scoping at the access layer. Simplest; places the full isolation burden on
  disciplined, centralized enforcement.
- **(b) Application-level scoping plus database-enforced isolation** — the data store
  independently prevents cross-tenant reads/writes even if an application-level check is ever
  missed. Defense-in-depth. **Recommended for the managed cloud deployment.**
- **(c) Physical separation per tenant** (separate schema or database per tenant) — strongest
  isolation; highest operational and migration cost.

Whichever is chosen, the attribution invariant (I.1) MUST hold and the scoping guarantee
(I.3 Guarantee A) MUST be uniform and fail-safe.

## I.9 Platform integration contracts (generic, black-box)

This functionality runs as an extension of the external platform. It interacts with the
platform only through that platform's **public extension contracts**, which the implementer
determines from the platform's own publicly-available code and documentation under that
platform's license. This specification states only the *behavioral obligations* that must be
met at those contracts — never the platform's internals.

- **Principal provision:** the platform admits authenticated requests and expects a typed
  principal (I.2) to be available for each. The new functionality MUST integrate with the
  platform's authentication/token lifecycle and supply principals in the form the platform's
  request handling consumes.
- **Workspace-to-organization resolution:** components of the platform that execute
  automations and that handle inbound events need to determine which organization owns a
  given workspace. The new functionality MUST provide that resolution.
- **Data-layer registration:** any new persistent entity MUST be registered with the
  platform's data-management facility so that schema management and migrations include it.
  *An unregistered entity yields incomplete schema/migrations and a failed build or start —
  treat correct registration as a release gate.*
- **Migrations:** schema for every new persistent entity MUST be delivered as
  platform-compatible migrations that run during initialization, validated against a
  populated data store before release.
- **Component/variation registration:** new feature components and the variation-point
  implementations of I.7 MUST be registered during the platform's initialization, selected by
  edition/plan.

> The implementer confirms each of these contracts against the platform's own public
> materials. This specification deliberately does not describe how the platform implements
> them.

## I.10 Tenancy foundation — definition of done

- [ ] A first user on a fresh deployment bootstraps to organization administrator with an
      organization and an initial workspace.
- [ ] Cross-tenant access via parameter manipulation is impossible (proven by test: a
      principal scoped to organization A cannot read or modify any record of organization B
      by supplying B's identifiers).
- [ ] Guarantee-A enumeration rules hold for administrators versus non-privileged members.
- [ ] Guarantee-B authorization is enforced for every tenant-scoped action in every sellable
      edition; finer-than-interface granularity works.
- [ ] An execution-context principal cannot act outside its bound workspace; a service caller
      cannot act outside its organization.
- [ ] Changing the session-revocation marker forces global re-authentication for that user.
- [ ] Workspace establishment is all-or-nothing; removal is recoverable-then-eventually-
      complete and safely repeatable.
- [ ] External-reference resolution is available only to service callers.
- [ ] All new entities are registered with the platform's data layer and covered by tested
      migrations; the application builds and starts with no missing-schema errors.
- [ ] The selected isolation strategy (I.8) is implemented and documented.

---

# PART II — PLATFORM CAPABILITIES

Each capability states what to build and why, plus its tenancy and contract rules.
Capabilities marked **(entitlement-gated)** are available per plan via the I.7 entitlement
resolver; authorization (I.3 Guarantee B) is never entitlement-gated. Capabilities are
grouped by the author's functional organization for readability; the grouping does not
reflect any particular system's internal structure. Where an open protocol governs a
capability, that public specification is the authority.

## A. Communications & notifications

### A.1 Outbound transactional messaging
- *Purpose:* deliver account and operational messages — member invitations, alerts, identity
  verification codes, credential-reset codes.
- *Behavior:* a pluggable delivery layer offering at least a real mail-transport sender and a
  development/no-op sender; configurable sender identity and branding; a delivery failure
  MUST NOT abort the operation that triggered it.
- *Dependency note:* invitations, alerting, and one-time codes depend on this; implement it
  early.

### A.2 Failure & threshold alerting
- *Purpose:* notify designated recipients when automations fail or cross configured
  thresholds.
- *Behavior:* per-workspace alert recipients and channels (email via A.1); duplicate
  notifications MUST be suppressed; the establishment variation point (I.7) MAY register a
  default recipient. Depends on A.1.

### A.3 Organization-level event notifications (entitlement-gated)
- *Purpose:* deliver organization-scoped event notifications to operator-configured
  destinations.
- *Behavior:* emit event payloads to configured destinations with verifiable signatures;
  destinations configurable per organization.

## B. Identity, authentication & federation

(All bind to I.2 / I.3 / I.4. Federation capabilities MUST conform to their governing public
protocol specifications.)

### B.1 Credential-based authentication
- Email/password authentication suitable for enterprise use, including administrator-
  established accounts, password policy, and restrictions on which email domains may
  self-register into an organization.

### B.2 One-time verification codes
- *Purpose:* identity verification and credential reset using short-lived, single-use codes.
- *Behavior:* codes are stored only in hashed form with an expiry; single-use is enforced;
  issuance is rate-limited; delivery is via A.1; each code is bound to one purpose so a
  verification code cannot serve as a reset code or vice versa.

### B.3 Enterprise SSO via SAML 2.0 (entitlement-gated)
- *Purpose:* let an organization's users authenticate through their corporate identity
  provider.
- *Behavior:* act as a SAML 2.0 service provider per the **public SAML 2.0 specification**;
  consume identity-provider metadata; validate signed assertions using a vetted library (do
  not hand-implement signature validation); map assertion attributes to a local user profile;
  associate the login with an organization by a verified email domain; provision or link the
  user on first successful login.

### B.4 Federated / social sign-in (entitlement-gated)
- *Purpose:* authentication through a mainstream OAuth 2.0 / OIDC identity provider.
- *Behavior:* implement the **public OAuth 2.0 / OIDC** authorization-code flow with at least
  one major provider; map the external identity to a local user; associate to an organization
  by domain rules.

### B.5 Directory provisioning via SCIM 2.0 (entitlement-gated)
- *Purpose:* automatic synchronization of users and groups from an identity provider.
- *Behavior:* implement the **public SCIM 2.0 protocol** (service-discovery, user, and group
  resources) scoped to an organization; create, update, and deactivate users in response to
  directory changes; map directory groups to roles/memberships.

### B.6 Embedded-host authentication (entitlement-gated)
- *Purpose:* let an embedding application authenticate *its own* end-users into the platform
  without those users holding native credentials.
- *Behavior:* accept a token signed by the embedding host (verified against the
  organization's signing key — see D.1), extract an external user reference, and provision or
  resolve a correspondingly scoped user on demand. Consumer of the service-caller
  external-reference resolution (I.5).

### B.7 Privileged-action guards
- Centralized checks asserting organization ownership or privileged-administrator status for
  organization-level operations, layered on I.2/I.3.

## C. Organization & workspace administration

### C.1 Multi-workspace administration (entitlement-gated)
- Full administration of multiple shared workspaces within one organization, honoring the I.5
  lifecycle and the organization's plan limits.

### C.2 Membership administration
- Invite members (via A.1), accept invitations, enumerate members, change a member's role,
  and remove members; maintain uniqueness per (user, workspace); feed Guarantee-B role
  resolution.

### C.3 Custom roles administration (entitlement-gated)
- The create/read/update/delete surface for organization-defined roles (see I.4).

### C.4 Per-workspace limits & quotas (entitlement-gated)
- Configurable limits and capability toggles per workspace, consulted at establishment/update
  and at the relevant enforcement points.

### C.5 Organization administration & multi-organization operations
- Administration of an organization's settings; operations spanning organizations restricted
  to a designated super-administrator role; an organization-scoped automation-template
  administration surface.

### C.6 Organization member administration
- Surfaces for managing an organization's users (including each user's own profile), layered
  on Part I identity and authorization.

## D. Embedding & white-labeling

### D.1 Token-signing key management (entitlement-gated)
- *Purpose:* asymmetric key pairs an organization uses to sign tokens for embedding and SSO
  handshakes.
- *Behavior:* generate key pairs; protect private key material (encrypted at rest); publish
  public key material for verification; support multiple concurrent keys and rotation; scope
  keys to an organization. (Foundational for B.6 and D.4.)

### D.2 White-label branding & theming (entitlement-gated)
- Per-organization logos, colors, naming, and appearance, surfaced consistently in the UI and
  in outbound messages (A.1). Bound to organization policy (I.1).

### D.3 Custom domains (entitlement-gated)
- *Purpose:* serve an organization under its own domain/subdomain.
- *Behavior:* register and verify domains; integrate with a CDN/edge provider's custom-
  hostname capability via that provider's **public API**; resolve requests on a custom
  hostname to the correct organization context.

### D.4 Embedding client SDK
- *Purpose:* embed the builder UI within a third-party web application.
- *Behavior:* a browser SDK that mounts the application in an isolated frame; defines a
  **bidirectional message protocol** between host page and embedded application (the team
  designs and publishes its own event/command vocabulary and payload shapes); performs a
  managed-authentication handshake using a host-signed token (D.1 + B.6); and lets the host
  control navigation and theming.

## E. Connections, credentials & secrets

### E.1 Organization-shared connections (entitlement-gated)
- Connections defined once at the organization level and attachable to multiple workspaces;
  attachment/detachment participates in workspace establishment/update (I.5). Subject to the
  attribution and scoping rules of Part I.

### E.2 Server-mediated OAuth connection brokering (entitlement-gated)
- Server-side handling of the OAuth 2.0 authorization-code flow on behalf of workspace
  connections, so end-users connect third-party applications without ever handling client
  secrets.

### E.3 Organization-provided OAuth client credentials (entitlement-gated)
- Allow an organization to register its own OAuth client credentials per provider, used in
  place of platform defaults.

### E.4 Managed credentials for embedded provisioning (entitlement-gated)
- Organization-managed credential records used to pre-provision connections within embedded
  contexts.

### E.5 Programmatic connection-management credentials (entitlement-gated)
- Issuable credentials that allow connection management through the programmatic interface.

### E.6 External secret-store integration (entitlement-gated)
- *Purpose:* source secret material from enterprise secret stores rather than the platform's
  own storage.
- *Behavior:* a pluggable provider interface with adapters for common managers (cloud-native
  secret stores and self-hosted vaults), each built against the vendor's **public SDK/API**;
  a cache with a sensible expiry; per-organization configuration; a provider outage MUST
  yield a clear error rather than a silent empty result.

## F. Programmatic access

### F.1 Management API credentials
- Issuable organization-scoped credentials (e.g., API keys) granting programmatic access to
  the management interface. The create operation returns the secret value once; subsequent
  listings expose only non-secret metadata.

## G. Capacity, plans & metering

### G.1 Concurrency capacity controls (entitlement-gated)
- *Purpose:* cap simultaneous automation executions for an organization or workspace.
- *Behavior:* define named capacity units with a maximum-concurrency value; assign workspaces
  to capacity units; the assigned capacity MUST be honored before a run is dispatched.
  Integrates behaviorally with the platform's execution orchestration.

### G.2 Dedicated execution capacity (entitlement-gated)
- The ability to direct an organization's executions to a dedicated set of execution
  resources. Integrates behaviorally with the platform's execution orchestration.

### G.3 Plans, subscriptions & billing (entitlement-gated)
- *Purpose:* subscription plans, usage metering, and payment.
- *Behavior:* plan definitions and per-organization plan state; usage metering; integration
  with a payment processor for the checkout/subscription lifecycle and its callbacks. The
  team designs its own commercial model and selects its own payment processor.

### G.4 Entitlement enforcement for self-hosted deployments
- *Purpose:* enforce plan/edition entitlements in deployments the operator controls.
- *Behavior:* a tamper-resistant entitlement mechanism (for example, signed,
  offline-verifiable entitlement tokens) appropriate to a self-hosted enterprise product. The
  exact form is a business/legal decision; note that a self-hosted product without some
  tamper-resistant entitlement check is trivially copyable.

#### G.4.a License-key activation & entitlement application
- *License key as the entitlement source.* A self-hosted enterprise deployment carries a license
  key on its organization plan record. A key resolves (via a vendor-hosted license service reached
  over trusted, SSRF-guarded outbound HTTP) to an entitlement document with a fixed shape: a
  per-capability set of feature booleans (SSO, SCIM, environments, embedding, audit-log, custom
  appearance, global connections, custom roles, project roles, API keys, manage-projects,
  manage-pieces, manage-templates, secret managers, analytics, event streaming, agents, AI
  providers, and — newer, optional, default-off — chat and worker groups), a show-powered-by flag,
  expiry/activated-at/created-at timestamps, a trial flag, the key string, and owner metadata. The
  field set is the contract the apply step depends on.
- *HTTP surface (exactly two public routes under `/v1/license-keys`).* `GET /:licenseKey` (get-key:
  the entitlement document or null, no side effects); `POST /verify` (verify-and-apply: `{licenseKey,
  platformId}` → compose-verify; null → INVALID_LICENSE_KEY; else apply + return the document).
  Both `public()` (the key is the credential). Request-trial and extend-trial are service operations,
  not routes here.
- *Service operations.* `requestTrial` (POST lead; 409 → email-already-has-key error), `getKey`
  (nil→null, 404→null, other→throw), `markAsActivated` (POST activate; 409/404 tolerated; best-effort
  key-activated telemetry that never blocks; the whole call swallows errors), `verifyKeyOrReturnNull`
  (compose-verify: nil→null; markAsActivated → getKey → expiry check; expired/missing → null),
  `extendTrial` (operator-key-gated), `applyLimits`, `downgradeToFreePlan`.
- *Apply-limits mapping.* One plan update writes every entitlement boolean one-to-one plus the
  license key + expiry. Tier: enterprise, but internal when the key grants neither SSO nor embedding
  on managed cloud. Team-projects limit: UNLIMITED when manage-projects granted, else the edition
  default (ONE on cloud, NONE self-hosted). Commercial fields (subscription id/status, purchased
  active-flow/project limits) cleared. Default asymmetry: absent entitlements default off — except
  aiProviders (defaults on); chat/worker-groups default off.
- *Expiry sweep & downgrade.* A named daily scheduled job (handler + upserted schedule at module
  init) iterates all organizations, skips those without a license key, and runs compose-verify per
  licensed org: missing/expired → downgrade to free; valid → re-apply (self-healing). Each org runs
  in its own try/catch. Downgrade writes the complete turned-off feature set (every entitlement
  false) so no stale paid capability survives.
- *Consumers.* The super-admin apply-license operation (C.5) and a boot/startup verification path
  both funnel through the same compose-verify + apply-limits, so behavior is identical however a key
  is applied.

#### G.4.b Usage metering & reporting (licensed self-hosted)
- *Purpose.* Report per-organization usage from licensed self-hosted instances back to the
  vendor for billing/oversight, keyed by the license key.
- *Scheduling & registration.* Reporting is a scheduled system job, not an HTTP endpoint. At
  module initialization the feature (a) registers a handler for a named job (`flow-run-tracking`)
  whose body runs the report-all-organizations routine, and (b) upserts a repeated schedule for
  that job on a daily cron. Registration is unconditional across editions — the gate is inside the
  routine (license-key presence), not the registration. Upserting the schedule by a stable job id
  makes repeated registration idempotent (one schedule survives restarts).
- *Gating & identity.* The routine loads the map of `{organization → license key}` for every
  organization whose plan record carries a non-null license key; an empty map returns immediately.
  Only mapped organizations are reported; the license key is both the gate and the report
  distinct-id. This is billing/meter data, not product telemetry, so it is deliberately independent
  of the product-telemetry opt-in flag.
- *Snapshot payload.* For each licensed organization: one event to the usage sink, distinct-id =
  the license key, payload `{ platform_id, active_flows, projects, users, daily_executions:
  Array<{ date, count }>, reported_at }`. `reported_at` is stamped once per run and shared by every
  organization's event. Transport is fire-and-forget capture.
- *Per-metric definitions (exclude soft-deleted workspaces).* `active_flows` = ENABLED automations
  in non-deleted workspaces per org. `users` = all users of the org. `projects` = non-deleted TEAM
  workspaces. `daily_executions` = PRODUCTION runs grouped by workspace + UTC calendar day, rolled
  up per org (test/preview runs excluded).
- *Day window.* Half-open UTC `[start-of-yesterday, start-of-today)` — the previous completed UTC
  day, so a day's figure is final on first send and idempotent per day. No backfill; at-most-once
  per day, no-retry.
- *Query & connection discipline.* The three count aggregates run sequentially (one pooled
  connection at a time). Executions: fetch licensed workspace ids first, then run-count scoped by
  `projectId IN (...)` (index-usable, no org join / no time-only scan), chunked into fixed batches
  with a fixed throttle delay, rolled up per org in memory. The whole routine is best-effort and
  failure-isolated — any error is caught, logged, never propagated.

## H. AI capabilities

### H.1 Managed model-provider access & AI usage metering (entitlement-gated)
- *Purpose:* meter AI usage in credits and broker model-provider access so end-users need not
  supply their own provider keys.
- *Behavior:* a per-organization credit balance decremented on use; a server-side proxy to
  model providers using operator/organization-held keys; provider-access provisioning.
  Provider keys MUST remain server-side and MUST NEVER be sent to clients. Default to current
  top-tier models; a strong default is the latest-generation Anthropic Claude models.

### H.2 Conversational agent layer (entitlement-gated)
- *Purpose:* persistent, governed conversational agent sessions.
- *Behavior:* conversations persisted and scoped to organization/workspace/user;
  **human-in-the-loop approval gates** requiring explicit confirmation before an agent
  performs a sensitive or irreversible action; **conversation-history management** including
  summarization/compaction of long histories and retention/hygiene of stored conversation
  data. Uses H.1 for model access. Approval-gate behavior is a safety requirement, not
  optional.

## I. Integration governance

### I.1 Integration availability governance (entitlement-gated)
- Per-organization control over which integrations are available to its workspaces: allow/deny
  selection, prominence/pinning, and organization-private integrations. Enforced both when
  presenting available integrations and when they are used.

## J. Lifecycle, versioning & templates

### J.1 Versioning, release & environment promotion (entitlement-gated)
- *Purpose:* version-control automations and promote them between environments.
- *Behavior:* serialize a workspace's automation state into a portable representation;
  synchronize that representation with an external version-control system; compute a
  structural difference between current and target state; apply a target state as all-or-
  nothing with rollback on failure. Sensitive material (credentials) MUST NOT be exported in
  clear.

### J.2 Organization template library (entitlement-gated)
- Manage and serve reusable automation templates within an organization.

## K. Governance & audit

### K.1 Audit logging
- *Purpose:* a tamper-evident record of security- and governance-relevant events
  (authentication, membership and role changes, connection and credential changes, releases,
  key events) — a compliance prerequisite.
- *Behavior:* append-only event records attributed to organization/workspace/actor; queryable
  with filtering and pagination; retention controls. SHOULD be available in all editions
  because it underpins compliance claims, rather than being entitlement-gated.

## L. Capacity & infrastructure visibility

### L.1 Execution-capacity visibility
- A read-only administrative view of the deployment's execution resources and their status.

---

# PART III — CROSS-CUTTING REQUIREMENTS

These apply to every capability above.

- **Data-layer registration & migrations:** every new persistent entity MUST be registered
  with the platform's data-management facility and covered by tested, forward-only migrations
  that run at initialization. *Release gate:* the application must build and start with no
  missing-schema errors.
- **Component registration:** new components and the I.7 variation-point implementations MUST
  be registered during the platform's initialization, selected by edition/plan.
- **Encryption at rest & key management:** all stored secret material (connection
  credentials, signing private keys, provider keys) MUST be encrypted at rest, with a defined
  key-management and rotation approach.
- **Fail-safe defaults:** any failure in scoping, authorization, or secret retrieval MUST
  deny or error; it MUST NEVER silently grant access or return an empty result as success.
- **Always-on authorization:** authorization (I.3 Guarantee B) is never entitlement- or
  edition-gated in a sellable edition.
- **Observability:** every capability SHOULD emit structured logs and metrics for security
  and operations; security-relevant events feed audit logging (K.1).
- **Tenant-isolation testing:** every capability ships with tests proving that a principal of
  one tenant cannot reach another tenant's data through that capability.

---

# PART IV — APPROVED REUSABLE INPUTS

Build from these public, reusable sources:

- **Public protocol specifications:** SAML 2.0; OAuth 2.0 / OpenID Connect; SCIM 2.0;
  JWT/JWS.
- **Vendor public SDKs/APIs** for: the chosen payment processor; CDN custom-hostname
  management; external secret managers; AI model providers; version-control hosting.
- **The external platform's own public materials**, solely for confirming the generic
  integration contracts of I.9, under that platform's license.

---

# PART V — DEFINITION OF DONE

- The Tenancy Foundation (Part I) meets every checkbox in I.10.
- Each implemented capability has: cross-tenant isolation tests; fail-safe error behavior;
  audit coverage for its security-relevant events; tested migrations; and correct
  edition/plan availability through the I.7 variability mechanism.
- Authorization is verified always-on across all editions.
- All secret material is encrypted at rest with a documented key-management approach.
- The application builds and starts cleanly with all new entities registered and migrated.

---

# GLOSSARY

Short, one-line meanings of the technical terms used throughout this document.

- **Tenancy:** the property of one system instance serving many separate customers whose data and access are kept isolated from one another.
- **Multi-tenancy:** an architecture where a single deployment hosts multiple tenants (organizations) at once, each isolated from the rest.
- **Tenant:** a single customer boundary whose data and access are isolated from other customers; here, the organization is the tenant root.
- **Organization:** the top tier of the ownership hierarchy — the tenant boundary that holds policy, branding, authentication configuration, plans, and entitlements.
- **Workspace:** a container of automation work that belongs to exactly one organization and holds the user's flows, connections, and related data.
- **Membership:** the record that associates a user with a workspace and carries the role that grants their permissions there.
- **Principal:** the verified identity-and-scope token under which a request runs, stating who is acting and within which tenant they may act.
- **Authentication:** confirming who a caller is (verifying identity), e.g. via password, SSO, or a signed token.
- **Authorization:** deciding what an authenticated caller is allowed to do, by checking their role's permissions for the requested action.
- **Tenant scoping:** constraining every data read/write so a caller can only reach records inside their own tenant.
- **Role:** a named bundle of permissions assigned to a member that determines which actions they may perform.
- **Permission:** a single discrete right to perform a specific action (for example, write a flow or manage members).
- **Custom role:** an organization-defined role with an administrator-chosen subset of permissions (as opposed to a built-in role).
- **Entitlement:** the set of capabilities a given organization is licensed/permitted to use, typically determined by its plan or edition.
- **Entitlement-gated:** a capability that is only available when the organization's plan/edition grants it.
- **Edition:** a packaged variant of the product (here: self-hosted community, self-hosted enterprise, or managed cloud).
- **Plan:** a subscription tier that determines an organization's limits and which entitlement-gated capabilities are enabled.
- **Owner:** the single user who holds ultimate control of an organization and cannot be removed while it exists.
- **Privileged administrator:** a user with elevated rights (e.g. organization admin) able to see and manage all workspaces in the organization.
- **External reference / external identifier:** an opaque ID an operator or embedding host assigns to correlate a platform entity with one in their own system.
- **Recoverable-removed (soft delete):** a state where an item is logically removed and unusable but still restorable, distinct from permanent deletion.
- **Idempotent:** an operation that can be repeated safely with the same end result, leaving no partial or duplicated effect.
- **Fail-safe:** behavior that, on failure or uncertainty, denies access or errors rather than granting access or returning empty-as-success.
- **All-or-nothing (atomic):** a multi-step change that either fully completes or fully rolls back, never leaving a partial state.
- **Variation point:** a well-defined place where behavior can differ by edition/plan via a swappable base-versus-enhanced implementation.
- **Establishment:** the act of creating/provisioning a workspace together with its mandatory companion records.
- **Enumeration:** listing items (e.g. workspaces or members), here required to be scoped and paginated.
- **Pagination:** returning large result sets in stable, bounded pages rather than all at once.
- **SSO (Single Sign-On):** logging in to the platform using an organization's central identity provider instead of a separate password.
- **SAML 2.0:** a public standard for browser-based enterprise SSO between an identity provider and a service provider.
- **OAuth 2.0:** a public standard authorization framework for granting applications delegated access without sharing passwords.
- **OIDC (OpenID Connect):** an identity layer on top of OAuth 2.0 used for federated/social sign-in.
- **SCIM 2.0:** a public standard protocol for automatically provisioning and deprovisioning users and groups from an identity provider.
- **JWT / JWS:** JSON Web Token / JSON Web Signature — compact, cryptographically signed tokens used to convey identity and claims.
- **Identity provider (IdP):** the external system that authenticates users and asserts their identity to the platform (used in SSO/SCIM).
- **Service provider:** the role the platform plays when it consumes assertions from an identity provider during SSO.
- **Token signing key:** an organization's asymmetric key pair used to sign and verify tokens for embedding and SSO handshakes.
- **Embedding:** running the builder UI inside a third-party application, typically in an isolated frame, authenticated via the host.
- **White-labeling:** presenting the product under a customer's own branding (logos, colors, naming, and custom domains).
- **Connection:** stored credentials/configuration that let an automation talk to an external application or service.
- **Global / organization-shared connection:** a connection defined once at the organization level and attachable to multiple workspaces.
- **Secret manager / secret store:** an external system that securely stores secret material the platform can resolve at runtime.
- **Encryption at rest:** storing sensitive data in encrypted form so it is unreadable without the key, even if storage is accessed directly.
- **Concurrency capacity:** a configured limit on how many automation executions may run simultaneously for an organization or workspace.
- **Metering:** measuring usage (for example, AI credits or executions) for limits and billing.
- **Audit logging:** an append-only, tamper-evident record of security- and governance-relevant events for compliance.
- **Migration:** a versioned, runnable change that brings the database schema to the state the application requires.
- **Schema:** the structure of the database (its tables, columns, indexes, and relationships).
- **Observability:** the structured logs and metrics that make the running system's behavior visible for security and operations.
- **Human-in-the-loop approval gate:** a required explicit human confirmation before an agent performs a sensitive or irreversible action.
- **Black box (specification style):** describing the system by its externally-observable behavior and contracts, not its internal implementation.
- **MUST / SHOULD / MAY:** requirement strengths in the RFC 2119 sense — mandatory, recommended, and optional respectively.
- **Definition of done:** the explicit, checkable conditions a capability must satisfy to be considered complete.

---

*End of specification.*
