# Agent Activity Surfaces — Design

**Status:** ✅ SHIPPED. All three tiers built and verified — api typecheck baseline (27, 0 in new
code); web typecheck 0 + vite build ✓; browser-agent suite **179/179** (incl. the agentScope
enforcement gate); scope-isolation tests **6/6** + `platformFilter` **11/11**. Operator tier is
endpoint-only (no UI), CLOUD-only, as specified.

**What shipped:**
- *Tier 0 (safety):* `agentScope.platformFilter` — the sanctioned platform-scoped read (tenant-only,
  no userId), so admin/operator aggregates pass the enforcement gate.
- *Tier 1 (user):* `GET /v1/browser-agent/runs` (owner-scoped) + web `/agent` "My Agent" page
  (runs table + KPIs + usage), dashboard sidebar, gated on `plan.browserAgentEnabled`.
- *Tier 2 (tenant admin):* `GET /v1/browser-agent/admin/oversight` (platform-scoped, `platformId` from
  the principal, `platformAdminOnly` + plan-gated) + web `/platform/observability/agent-activity`
  "Agent Activity" dashboard (`PlatformLayout`-gated, `LockedFeatureGuard`).
- *Tier 3 (operator, NO UI):* `GET /v1/admin/browser-agent/activity` — cross-tenant, operator-key +
  CLOUD-only, mirroring `ai-gateway-admin`. No web client method (a browser can't hold the key).

The design below is the plan this was built to.

---

**Original status:** design for review, before build.
**Goal:** surface browser-agent activity in the web app (today it's extension-only), at three tiers —
individual user, full tenant (platform admin), and operator (Intellisper) — mirroring how the
blockunits **automation/Flows** side already presents Runs (per-user) and Impact (tenant) and how
**AI Spend / Chat Analytics** present operator/admin oversight.

## Hard constraints (non-negotiable)

1. **Additive only — nothing breaks.** New endpoints, new pages, new sidebar items. No existing route,
   entity, DTO, or scope helper is modified in a behaviour-changing way. The extension keeps working
   byte-for-byte; the browser-agent module's existing owner-scoped surfaces are untouched.
2. **No data leaks.** Three tiers = three distinct, enforced scope boundaries (below). The
   browser-agent **agentScope enforcement-gate test** statically fails any repo read that bypasses
   `agentScope` — so admin/operator aggregates route through a *sanctioned* helper, never a hand-rolled
   query. Cross-tenant reads are operator-key-gated + CLOUD-only, and never shipped to a browser.
3. **Everything verified.** Each tier ships with tests proving scope isolation (cross-user and
   cross-tenant), typecheck at baseline, and the enforcement gate green.

## The scope model (why the three tiers are genuinely different)

All agent tables carry `platformId + userId`. Today every read is **owner-scoped**
(`agentScope.ownerFilter` → `platformId = p AND userId = u`). There is no admin-visibility path and no
cross-user aggregation anywhere. So:

| Tier | Boundary | Enforced by |
|---|---|---|
| **User** ("my activity") | `platformId + userId` (owner) | existing `agentScope.ownerFilter` — reuse as-is |
| **Tenant admin** ("platform oversight") | `platformId` only (all users on the caller's OWN platform) | NEW `agentScope.platformFilter` (sanctioned) + `platform.id` taken from the principal, never the request |
| **Operator** (Intellisper) | cross-tenant (all platforms) | operator-key preHandler + CLOUD-only registration; NEVER a tenant JWT, NEVER shipped to a browser |

### Tier 0 — the shared safety primitive (build first)

Add to `browser-agent/scope/agent-scope.ts`:

```ts
// Platform-scoped read: filters by tenant ONLY (all users on that platform), NO userId. This is the
// SANCTIONED path for admin/operator aggregates — it keeps the enforcement gate green while making
// "admin sees the whole tenant, still tenant-bounded" a single auditable rule, not a scattered query.
platformFilter(ctx: { platformId: string }): { platformId: string }
```

Every admin/operator aggregate query uses `agentScope.platformFilter(...)` (tenant admin) or is
explicitly operator-gated + `// agentScope-exempt: operator cross-tenant, gated by operator key`
(operator). This is the leak-prevention keystone: the *only* two ways to read agent data beyond an
owner are (a) `platformFilter` bounded to the caller's own platform, or (b) the operator gate. Both are
centralized and test-covered.

## Server work required (the honest gap list)

Reusable today (no build): conversations list/messages, routines list/get, routine-run history,
batches list/detail (+ per-row status), schedules list, usage-vs-caps summary — all owner-scoped.

Must build:

**Tier 1 (user):** `GET /v1/browser-agent/runs` — an owner-scoped, cursor-paginated list over
`browser_agent_run` (status, stepCount, tokenCost, startedAt/endedAt + parent conversation title).
The entity and `agentScope.ownerFilter` already support it; only the service method + route are new.
Mirrors `flow-run-controller.ts` list (cursor pagination, `securityAccess.project([USER], QUERY)`).

**Tier 2 (tenant admin):** a platform-scoped aggregate service + controller, plan-gated
(`platformMustHaveFeatureEnabled(plan.browserAgentEnabled)`), `securityAccess.publicPlatform([USER])`
+ admin check, scoped to `request.principal.platform.id`. Endpoints (mirroring `platform-analytics`):
- `GET /v1/browser-agent/admin/overview?days=` → `{ totalRuns, activeUsers, totalTokenCost, runsByStatus[], topRoutines[], byUser[] }` — `COUNT`/`SUM(tokenCost)`/`COUNT(DISTINCT userId)`/`GROUP BY` over `browser_agent_run` via `agentScope.platformFilter`.
- (Reuses the existing per-platform usage counters for the metric meter.)

**Tier 3 (operator, NO UI):** `GET /v1/admin/browser-agent/activity` — cross-tenant, grouped by
platformId; operator-key gate + CLOUD-only, mirroring `ai-gateway-admin.module.ts` exactly
(edition===CLOUD AND `AppSystemProp.API_KEY`, deny-by-default, `public()` routes). Endpoint only —
no web page. Available on CLOUD edition only.

## Web work (UX design)

### Tier 1 — "My Agent" (user area)

A new dashboard-sidebar entry **"My Agent"** (`show: platform.plan.browserAgentEnabled` + the user has
agent activity), grouping the user's own agent surfaces. Not under `/platform/*` (that's admin) — under
the normal dashboard, like `/impact`. Tabs, matching the flow-runs/impact visual language:

- **Runs** — a `DataTable` of my agent runs: Status (badge via a new `agentRunUtils.getStatusIcon`
  mirroring `flow-run-utils`), Task (parent conversation title), Steps, Tokens, Started, Duration.
  Row → run detail (a step timeline; reuse `features/agents/agent-timeline` shapes). Cursor pagination
  + status filter, exactly like the runs table.
- **Routines** — my saved routines (name, steps, last run, version) with run-history drill-down.
- **Usage** — my plan's caps vs current-month usage (the existing `/usage` meter), plus an "upgrade"
  affordance when near a cap.

UX principles: one clear KPI strip up top (runs this period, success rate, tokens), then the table.
Empty states that teach ("Start a task from the Intellisper extension to see runs here"). Loading
skeletons (`DataTableSkeleton`, `MetricCardSkeleton`). Every number labelled and unambiguous.

### Tier 2 — "Agent Oversight" (tenant admin, under Observability)

A `/platform/observability/agent-activity` page, `PlatformLayout`-gated (admin-only),
`LockedFeatureGuard` on `plan.browserAgentEnabled`. Mirrors the Impact dashboard:

- KPI card row (`MetricCard`): **Total runs**, **Active agent users**, **Token spend** (from
  `SUM(tokenCost)`; shown as tokens, and — if we want $ — via the AI-gateway price table), **Success
  rate**.
- **Runs by status** (a small chart) + **runs over time**.
- **By user** table (which users are most active — the team-oversight view) and **Top routines**.
- Time-period selector (mirroring Impact's `AnalyticsTimePeriod`).

UX principles: this answers "how is my team using the agent, and what is it costing us?" at a glance —
the same questions Impact answers for automations. Everything platform-scoped to the admin's own
tenant; a user breakdown is fine here (it's their own team), unlike the operator tier.

### Tier 3 — operator: **endpoint only, no UI** (per decision).

## Build sequence (each step verified before the next)

0. `agentScope.platformFilter` + test (the safety primitive).
1. Tier-1 server (`GET /runs`) + test.
2. Tier-2 server (admin aggregates) + cross-user-isolation tests + enforcement gate green.
3. Tier-3 server (operator, CLOUD-only) + scope tests (mirror the 13 `/spend/admin` gate tests).
4. Tier-1 web ("My Agent" area).
5. Tier-2 web ("Agent Oversight" dashboard).
6. Full verify: enforcement gate, both repos typecheck at baseline, new tests, web build.

## Leak-prevention checklist (applied at every tier)

- [ ] User endpoints: `agentScope.ownerFilter` (unchanged).
- [ ] Tenant-admin: `platformId` from `request.principal.platform.id` ONLY — never from the request;
      `agentScope.platformFilter`; admin-gated; plan-gated.
- [ ] Operator: operator-key preHandler + `edition===CLOUD` (both required, deny-by-default);
      `public()` routes; CLOUD-only registration; NO web client method (a browser can't hold the key).
- [ ] Enforcement gate stays green (every read via `agentScope` or a documented exempt marker).
- [ ] Tests prove: user A cannot see user B's runs; tenant X admin cannot see tenant Y's data; the
      operator route denies wrong-key / non-cloud / tenant-JWT.
