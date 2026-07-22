# Intellisper — Subscription Plans Proposal (Dual Architecture)

> **Status:** starting-point v1. Amounts are a defensible launch baseline, to be
> revised once real usage telemetry exists. Grounded in the COGS model
> (`COST_MODEL_METHODOLOGY.md`, `cost-model.csv`) and the *actual* plan/billing
> code in this repo.
>
> **✅ FOUNDATION BUILT (2026-07-14).** The critical-path dependency from §9 — the
> browser-agent metering + cap-enforcement layer — is now **implemented, wired into
> every consumption path, and tested (150/150 browser-agent unit tests, api
> typecheck clean)**. This means the Agent-side monthly caps are *enforceable today*.
> What remains is the plan/packaging rollout (new `PlanName` tiers, plan columns +
> migration, Stripe price wiring, frontend cards) — see the "What's built vs what's
> next" box below and the handoff prompt in §11.
>
> **Two products, one billing spine.** The browser agent (an AI teammate that acts
> inside your own logged-in browser + records/replays **Routines**, incl.
> unattended batch/schedule) and the automation platform (a visual workflow
> builder over ~800 apps). This proposal packages them into shared and standalone
> plans and specifies exactly how each limit plugs into existing code seams.

---

## 0. TL;DR

- **Name the automation side "Intellisper Studio"** (this is a hard requirement. Correct any other and all wrong references either pre-existing or here).
- **Two plan architectures** to choose between:
  - **Architecture A — Bundled Tiers** (recommended): a small set of named tiers,
    each a `PlatformPlanWithOnlyLimits` constant, differentiated by which product
    scope(s) they unlock + numeric caps. Simplest to reason about and to bill.
  - **Architecture B — Modular Core + Packs**: a cheap "core" plan plus
    independently-priced **Agent Pack** and **Studio Pack** add-ons, billed as
    Stripe line items (like the existing `active-flow` add-on).
- **Product scope is the packaging axis.** The code already has
  `ProductScope = BROWSER | BLOCKUNITS | FULL` — the three requested individual
  options (browser-only / automation-only / dual) map to it 1:1.
- **Everything reuses existing seams**: plan-seed constants, `PlanName`,
  `platformMustHaveFeatureEnabled`, `LockedFeatureGuard`, the AI-credit rail
  (1000 credits = $1), the `active-flow` metered add-on, and the five
  already-parameterized browser-agent Phase-9 cap hooks.

### What's BUILT vs what's NEXT

**✅ Built (this pass) — the enforceable metering + caps foundation:**
- `browser_agent_usage_counter` is now **written**: an atomic
  `INSERT … ON CONFLICT DO UPDATE … RETURNING count` per metered action, pooled per
  platform per UTC month (`packages/server/api/src/app/browser-agent/usage/browser-agent-usage.service.ts`).
- **Metering hooked into every consumption path**: `dispatchTool` (ACTIONS /
  RESEARCH / FILE_OPS / MEMORY_OPS via the shared `agentUsage.metricForToolName`
  map), routine replay + each batch row (ROUTINE_RUNS), and grammar (QUICK_TOOLS).
- **`browserAgentPlan` cap resolver** (`…/usage/browser-agent-plan.service.ts`): a
  tier→caps table (matching the Agent tiers in §3.1a) with a **single swap point**
  (`resolveTier`/`capsForPlatform`) — when the real plan columns land, only that
  function changes; no call site moves.
- **All five parameterized seams wired** to the resolver: batch caps
  (`maxBatchRows`/`maxConcurrentRows`), schedules (`maxSchedules`), `reasoningAllowed`,
  memory `recallTier`, and `sharingUnlocked`.
  > **Superseded (0.103.0):** memory's caps (`recallTier`/`maxFacts`/`enabled`) have since moved OUT
  > of `browserAgentPlan` into their own `memoryPlan` resolver + `platform_plan.memoryCaps` column.
  > Memory is a third product door, sold to Studio without the agent — see **§8a**.
- **Enforcement**: over-cap / not-on-plan → `FEATURE_DISABLED` with an upgrade
  prompt; fail-open on a metering error (never blocks legit work); reasoning fails
  **closed** on a lookup error (never over-grants Opus).
- **Read surface**: `GET /v1/browser-agent/usage` returns current-month usage vs caps
  for the billing UI.
- **Shared** (`@intelblocks/shared` → 0.97.0): `agentUsage` helpers,
  `BrowserAgentCaps`, `UNLIMITED_CAP`, usage-summary DTOs.

**⬜ Next (the plan/packaging rollout — the handoff in §11):** new `PlanName` tiers +
plan-seed constants; the `platform_plan` cap columns + migration (so the resolver's
swap point reads real data); Stripe price IDs + webhook reconcile; frontend
`LockedFeatureGuard` cards + the usage meter UI; product-scope → default-plan
mapping on signup.

---

## 1. Naming the automation ("blockunits") side — 4 options

The browser side already reads as **"the browser agent"** and its saved tasks are
**Routines**. The automation side needs a parallel, user-friendly name. Four options,
each consistent with what it does (visual workflows across ~800 apps) and with the
Intellisper brand:

| # | Name | Why it fits |
|---|---|---|
| **1** | **Intellisper Studio** | Direct, universally-understood term for visual automations ("a flow"); the code already calls the unit a *flow* (`FlowEntity`, `activeFlowsLimit`), so product and code vocabulary align. Pairs cleanly with "Routines" on the browser side. **Recommended.** |
| **2** | **Intellisper Studio** ⭐ **(CHOSEN)** | Positions it as the *builder* — the canvas where you compose app-to-app automations. Reads premium; good if marketing wants a "workbench" feel distinct from the run-time. |
| **3** | **Intellisper Connect** | Leads with the ~800-app integration story ("connect your apps and let it run"). Strong if the app library is the headline differentiator. |
| **4** | **Intellisper Blocks** | Ties to the internal "block" concept (the rebrand of "piece") and the folder name; approachable, construction-kit metaphor. Slightly more internal-facing. |

**DECISION (§0 hard requirement): "Intellisper Studio."** It is the most immediately legible to a
buyer, matches the code's own noun, and gives a clean two-sided story:
**Intellisper = Routines (in your browser) + Studio (across your apps).**

The rest of this document uses **Studio** (automation side) and **Agent** (browser
side).

---

## 2. Packaging philosophy (why this shape)

Three facts from the COGS model drive the packaging:

1. **The browser agent is the token-heavy, higher-COGS surface.** An interactive
   agentic task ≈ **$0.017**; a research run ≈ **$0.030**. These are AI-dominated.
2. **Unattended/batch Routines are astonishingly cheap.** A batch row ≈ **$0.0009**
   (~20× cheaper than an interactive task) because deterministic replay uses **zero
   model turns** on the happy path and runs on the **user's own browser** (no cloud
   browser). *This is the pricing superpower — sell scale cheaply.*
3. **Flow runs are near-free to us** (~$0.00003 compute); the real variable cost of
   the automation side is **in-flow AI** (billed as AI credits) — i.e. the customer's
   own model spend, already pass-through-metered via OpenRouter.

⇒ **Meter what actually costs us**, and make the cheap-but-valuable things generous:
- **AI is metered as credits** (both sides can draw from one pooled monthly
  allowance) — this is the single biggest COGS lever and the code already meters it.
- **Interactive Agent usage** gets **monthly action/research/quick-tool caps** (the
  six `AgentUsageMetric` counters) — token-heavy, so cap it.
- **Routine runs (incl. batch rows) get high caps** — cheap, so be generous; this is
  the headline "run it at scale on your own session" value.
- **Flows are gated by `activeFlowsLimit`** (concurrently-enabled flows) — the
  existing, proven automation lever — plus AI credits for in-flow AI.
- **Team/enterprise capabilities** (SSO, SCIM, audit, RBAC, global connections,
  white-label, version control) are **flag-gated**, exactly as today.

### The metered dimensions (already in code)
| Side | Dimension | Code home | New or existing |
|---|---|---|---|
| Both | **AI credits** ($ of model spend; 1000 credits = $1) | `includedAiCredits`, OpenRouter key limit | existing |
| Flows | **Active flows** (enabled at once) | `activeFlowsLimit` + `active-flow` add-on | existing |
| Flows | **Projects / team projects** | `projectsLimit`, `teamProjectsLimit` | existing |
| Agent | **Actions** / **Research** / **File ops** / **Routine runs** / **Quick tools** / **Memory ops** | `AgentUsageMetric` (6 counters) | defined, **not yet metered** (§9) |
| Agent | **Batch rows / concurrency / schedules** | `maxBatchRows`, `maxConcurrentRows`, `maxSchedules` caps | parameterized, **hardcoded** (§9) |
| Agent | **Reasoning tier** (Opus) | `reasoningAllowed` | parameterized, hardcoded `false` |
| **Memory** *(own door — agent AND Studio, §8a)* | **Recall depth / stored facts / door** | `MemoryCaps` (`recallTier` free 3 / pro 5 / ent 8; `maxFacts`; `enabled`) on `platform_plan.memoryCaps` | **live** — resolved by `memoryPlan`, independent of `browserAgentEnabled` |
| Agent | **Sharing** | `agentSharingUnlocked` + `agentSharingOptIn` | existing flags |

---

## 3. Architecture A — Bundled Tiers (RECOMMENDED)

A compact ladder. Each row is a `PlatformPlanWithOnlyLimits` seed constant + a
`PlanName`. **Product scope** selects which of the three individual doors a customer
enters; **tier** selects the caps.

### 3.1 — Cloud · Single individual (single user)

Prices are **USD / month**, billed via Stripe (annual = ~2 months free, i.e. ×10).
"AI credits" = included monthly model-spend allowance ($1 = 1000 credits), pooled
across whichever products the plan includes; overage via top-up (existing rail).

#### (a) Agent-only (browser side) — `ProductScope.BROWSER`
| Plan | Price/mo | AI credits (incl.) | Actions/mo | Research/mo | Routine runs/mo | Batch rows (max) | Concurrency | Schedules | Reasoning (Opus) | Memory recall | File ops/mo | Quick tools/mo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Agent Free** | $0 | 100 ($0.10) | 25 | 3 | 50 | — (no batch) | — | — | off | 3 | 20 |
| **Agent Starter** | **$12** | 3,000 ($3) | 400 | 40 | 2,000 | 200 | 2 | 5 | off | 5 | 300 |
| **Agent Pro** ⭐ | **$29** | 12,000 ($12) | 3,000 | 300 | 20,000 | 1,000 | 3 | 20 | **on** | 8 | 3,000 |

*Rationale:* Agent Pro's fully-loaded COGS at the modeled "power user" shape is
~**$3/mo** (see COGS user-month), so **$29** lands ~90% gross margin with headroom
for heavy users; Starter ~85%+. Free's caps sit at/below the code's current defaults
so it's a safe trial. Batch is the cheap headline lever — runs are generous.

#### (b) Studio-only (automation side) — `ProductScope.BLOCKUNITS`
| Plan | Price/mo | AI credits (incl.) | Active flows | Projects | Tables | AI Agent step | Data tables triggers | MCP endpoint | Analytics |
|---|---|---|---|---|---|---|---|---|---|
| **Studio Free** | $0 | 0 | 2 | 1 | ✓ | ✓ (BYO credits) | ✓ | ✓ | ✓ |
| **Studio Starter** | **$15** | 2,000 ($2) | 10 | 1 | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Studio Pro** ⭐ | **$39** | 8,000 ($8) | 40 | 3 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Extra active flows | **+$5 / flow / mo** | — | metered add-on | — | — | — | — | — | — |

*Rationale:* mirrors today's `STANDARD_CLOUD_PLAN` ($=? , 10 flows, 200 credits) but
turns it into a proper ladder. Flow runs are near-free to us; the variable cost is
in-flow AI (credits). `active-flow` add-on already exists at **$5/flow** — keep it.

#### (c) Dual / Complete — `ProductScope.FULL`
The flagship. Both products, one pooled AI-credit wallet, best caps. **Plus two
high-value dual-only capabilities** to make "Complete" more than the sum:

- **Routine → Flow bridge** (high-value add): let a saved browser **Routine** be
  invoked as a step inside a **Flow** (and vice-versa: a Flow can hand a task to the
  Agent). This is the unique thing only the combined product can do — the biggest
  reason to buy Complete.
- **Unified memory + connections**: the Agent's private memory and the platform's
  app connections are available to both sides.

| Plan | Price/mo | AI credits (incl., pooled) | Agent caps | Studio caps | Dual features |
|---|---|---|---|---|---|
| **Complete Starter** | **$25** | 5,000 ($5) | = Agent Starter | 10 flows / 1 project | Routine→Flow bridge (basic) |
| **Complete Pro** ⭐ | **$59** | 20,000 ($20) | = Agent Pro (Opus on) | 40 flows / 3 projects | Routine↔Flow bridge, unified memory/connections, priority handling |

*Rationale:* Complete Pro ≈ **$59** vs buying Agent Pro ($29) + Studio Pro ($39) =
$68 → a ~13% bundle discount, a bigger pooled credit wallet, and the exclusive
bridge feature. Fully-loaded COGS for a heavy dual user ≈ **$4–6/mo** → ~90% margin.

### 3.2 — Cloud · Enterprise (multiple users, self-serve teams)

Team plans use `teamProjectsLimit`, `projectRolesEnabled`, `customRolesEnabled`,
`globalConnectionsEnabled`, seats. Billed per-seat (base) + pooled resources.

| Plan (scope) | Base / seat / mo | Min seats | AI credits (pooled) | Seats/Projects | Agent caps (per seat) | Flows | Team features |
|---|---|---|---|---|---|---|---|
| **Team Agent** (BROWSER) | **$22** | 3 | 8,000 ($8) pooled | roles + up to 10 projects | = Agent Pro | — | RBAC, shared memory *(if unlocked)*, alerts |
| **Team Studio** (BLOCKUNITS) | **$28** | 3 | 6,000 ($6) pooled | roles + up to 10 projects | — | 100 flows pooled, global connections | RBAC, global connections, project roles, alerts |
| **Team Complete** (FULL) ⭐ | **$45** | 3 | 20,000 ($20) pooled | roles + up to 25 projects | = Agent Pro | 100 flows pooled | all of the above + Routine↔Flow bridge + audit logs |

*Rationale:* team plans add seat multiplication + governance flags. Pooled AI credits
+ pooled active flows amortize well across a team. `maxConcurrentRows` rises with seat
count (e.g. `3 + seats`). Sharing is **opt-in per user** and only takes effect if the
platform admin unlocks it (`agentSharingUnlocked`).

Personal memory follows a **three-condition gate** — an admin sees one of a member's personal facts
only if *all three* hold: (1) the admin unlocked sharing platform-wide, (2) that member opted in, and
(3) that member marked **that specific fact** as shared. Any one off ⇒ invisible. The member always
has the last word: a fact left private is unreachable by an admin, and **an admin can never mark a
member's fact as shared on their behalf** (the only writer of `visibility` is scoped to the owning
user). Revoking either switch hides the facts on the next read while the per-fact marks are kept, so
re-enabling restores exactly the previous selection. Org (`PLATFORM`) and flow (`FLOW`) memory are
org-owned by design and are not covered by this gate.

### 3.3 — Enterprise edition (self-hosted / contract) — Complete features

The **Enterprise edition** (`IB_EDITION=ee`) is contract-priced, unmetered by
default (seeds `OPEN_SOURCE_PLAN`: unlimited flows/projects, `includedAiCredits: 0` →
customer brings their own AI keys/credits). It ships **all** capabilities:

- **Everything in Complete Pro**, unlimited by contract.
- **Full governance stack** (all already flag-gated): SSO/SAML, SCIM, RBAC + custom
  roles, audit logs, git-backed version control + release rollback, secret-managers,
  global + secrets-backed connections, white-label embedding + custom domains,
  event destinations, API keys.
- **Browser-agent enterprise**: unlimited batch rows / concurrency / schedules,
  Opus reasoning on, deepest memory recall, sharing unlockable by the platform admin.
- **Bring-your-own AI**: `aiProvidersEnabled: true` — connect any of the 10 supported
  providers (Anthropic/OpenAI/Google/Azure/Bedrock/Mistral/OpenRouter/…) with your
  own keys; no included-credit metering.
- **No Stripe** (billing inert in EE) — activation via **license key**
  (`licenseKey` + `applyLimits`, existing path).

**Pricing:** custom / "Contact sales." Anchor internally at a **seat + platform**
floor (e.g. from ~$X,000/yr platform + per-seat), sized to the customer; the model's
fully-loaded per-user COGS (~$3–6/mo) means even a modest per-seat contract is
high-margin, and the value is governance + unlimited scale, not per-unit cost.

---

## 4. Architecture B — Modular Core + Packs (alternative)

For buyers who want to pay only for the side they use, with the option to add the
other later — expressed entirely as **Stripe line items** (the pattern the code
already uses for `active-flow`).

### 4.1 — Structure
- **Intellisper Core** — $9/mo. A thin base: account, 1 project, 2 active flows,
  1,000 pooled AI credits, Agent Free caps. Gives everyone a real taste of both sides.
- **Agent Pack** — +$18/mo. Unlocks `browserAgentEnabled` + Agent Pro caps
  (Opus on, batch/schedules, higher action/research caps, +8,000 credits).
- **Studio Pack** — +$24/mo. Unlocks Studio Pro caps (40 active flows, 3 projects,
  +6,000 credits, global connections).
- **Add-ons (metered):** extra active flows +$5/flow (existing); extra AI credits
  (existing top-up); extra batch-row capacity pack; extra seats (team).

### 4.2 — How the requested options fall out
| Requested option | Architecture B composition | Effective $/mo |
|---|---|---|
| Individual · Agent-only | Core + Agent Pack | **$27** |
| Individual · Studio-only | Core + Studio Pack | **$33** |
| Individual · Dual (Complete) | Core + Agent Pack + Studio Pack | **$51** (bundle discount → **$47**) |
| Enterprise (team) · Agent-only | Team Core + Agent Pack × seats | per-seat |
| Enterprise (team) · Studio-only | Team Core + Studio Pack × seats | per-seat |
| Enterprise (team) · Dual | Team Core + both packs × seats | per-seat |

### 4.3 — A vs B — recommendation
| | **A — Bundled Tiers** | **B — Core + Packs** |
|---|---|---|
| Buyer clarity | High (pick a plan) | Medium (compose) |
| Upsell path | Tier jump | Add a pack (frictionless) |
| Billing complexity | Low (named plans) | Medium (line items) |
| Fit to code today | Very high (plan constants) | High (add-on rail exists) |
| Revenue expansion | Good | **Best** (packs + metered add-ons) |

**Recommendation: ship Architecture A at launch** (clearest for a v1, least billing
surface area, maps directly to `PlanName` constants), and **keep B's add-on
mechanics** (extra flows, credit top-ups) as the expansion rail *inside* A — which is
exactly what the code already supports. Revisit a full modular model once telemetry
justifies finer-grained metering.

---

## 5. Feature → flag/limit matrix (what each plan sets)

Every cell below is an existing `platform_plan` field (or a proposed new one, marked
`NEW`). This is the literal shape a plan-seed constant takes.

| Field (platform_plan) | Free | Starter | Pro | Team | Enterprise ed. |
|---|---|---|---|---|---|
| `plan` (`PlanName`) | `*_free` NEW | `*_starter` NEW | `*_pro` NEW | `*_team` NEW | `enterprise` |
| `includedAiCredits` | 100–1000 | 2000–5000 | 8000–20000 | pooled | 0 (BYO) |
| `activeFlowsLimit` | 2 | 10 | 40 | 100 | null (∞) |
| `projectsLimit` | 1 | 1 | 3 | 10–25 | null (∞) |
| `teamProjectsLimit` | ONE | ONE | ONE | UNLIMITED | UNLIMITED |
| `agentsEnabled` (in-flow AI step) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tablesEnabled` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `aiProvidersEnabled` (BYO keys) | ✗ | ✗ | ✗ | ✗ | ✓ |
| `analyticsEnabled` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `globalConnectionsEnabled` | ✗ | ✗ | ✗ | ✓ | ✓ |
| `projectRolesEnabled` / `customRolesEnabled` | ✗ | ✗ | ✗ | ✓ | ✓ |
| `auditLogEnabled` | ✗ | ✗ | ✗ | Team Complete | ✓ |
| `ssoEnabled` / `scimEnabled` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `secretManagersEnabled` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `environmentsEnabled` (git/versioning) | ✗ | ✗ | ✗ | ✗ | ✓ |
| `customAppearanceEnabled` / `customDomainsEnabled` (white-label) | ✗ | ✗ | ✗ | ✗ | ✓ |
| `eventStreamingEnabled` | ✗ | ✗ | ✗ | Team | ✓ |
| `chatEnabled` (platform copilot) | ✗ | ✗ | Pro+ | ✓ | ✓ |
| `browserAgentEnabled` NEW-in-plan | scope-dep. | scope-dep. | scope-dep. | scope-dep. | ✓ |
| `agentSharingUnlocked` | ✗ | ✗ | ✗ | admin-set | admin-set |
| **Agent caps** (`maxBatchRows`,`maxConcurrentRows`,`maxSchedules`,`reasoningAllowed`,`recallTier`, monthly `AgentUsageMetric` caps) NEW | Free row §3.1a | Starter row | Pro row | Team row | unlimited |

---

## 6. COGS & gross-margin justification (starting-point)

Using the COGS model's per-unit costs and the "representative paid user" month:

| Plan | Price/mo | Modeled fully-loaded COGS (typical user) | Gross margin |
|---|---|---|---|
| Agent Starter | $12 | ~$1.5–2.0 | ~85% |
| Agent Pro | $29 | ~$3.0 | ~90% |
| Studio Starter | $15 | ~$0.5–1.0 (mostly credits) | ~93% |
| Studio Pro | $39 | ~$1.5 | ~96% |
| Complete Pro | $59 | ~$4–6 | ~90% |
| Team Complete (per seat) | $45 | ~$3–5 | ~90% |

**Why the margins hold:** (1) unattended batch is ~$0.0009/row — scale is nearly
free; (2) AI credits are pass-through-metered, so heavy model use is covered by the
credit wallet + top-ups, not absorbed; (3) flow runs are ~$0.00003; (4) fixed infra
amortizes to ~$1.4/user at 500 users and falls as you grow. **The caps exist to
bound worst-case token spend (research/interactive), not to nickel-and-dime.**

> ⚠️ These are **modeled**, not measured. The `est` usage-shape inputs are the
> largest error source. Instrument the `usage_counter` (§9) at launch, watch p90
> `AgentRun.tokenCost`, and re-tune caps/prices in v2 — exactly as the sibling repo's
> `billing-cost-report.ts` did.

---

## 7. Code-integration plan (plugs into existing seams)

This is a **redesign of the plan layer** that is deliberately additive and follows
the four repo rules (entity-registration, data-isolation, edition-safety, safe-http).
Ordered by dependency.

### 7.1 — Shared contract (`packages/shared`)
1. **`platform.model.ts`**
   - Extend `PlanName` enum with the new tiers (`agent_free/starter/pro`,
     `flows_free/starter/pro`, `complete_starter/pro`, `team_agent/flows/complete`).
     *(Pattern already present: `standard`, `enterprise`, `appsumo_intellisper_tier1..6`.)*
   - Add **browser-agent cap fields** to the plan limits shape (or a nested
     `agentLimits` object): `maxBatchRows`, `maxConcurrentRows`, `maxSchedules`,
     `reasoningAllowed`, `recallTier`, and the six monthly caps
     (`actionsLimit`, `researchLimit`, `fileOpsLimit`, `routineRunsLimit`,
     `quickToolsLimit`, `memoryOpsLimit`). **Decision point** (see §8):
     put these *in* the shared `PlatformPlan`, OR keep them DB-only like
     `browserAgentEnabled` and resolve via a `browserAgentPlan` service. **Recommend
     promoting them into the plan** for the redesign so one plan row is the single
     source of truth and the frontend can gate on them.
   - Extend `PlatformUsageMetric` with the browser-agent metrics for usage read-back.
   - Version-bump `@intelblocks/shared` (minor — new exports).
2. **`ee/billing/index.ts`**
   - Add new **plan-seed constants** (`AGENT_PRO_CLOUD_PLAN`, `FLOWS_PRO_CLOUD_PLAN`,
     `COMPLETE_PRO_CLOUD_PLAN`, `TEAM_*`, …) as `PlatformPlanWithOnlyLimits` — copy
     the `STANDARD_CLOUD_PLAN` shape and set flags/limits/caps per §3/§5.
   - Add new `PRICE_NAMES` + `PRICE_ID_MAP` entries for each billable base plan
     (dev/prod Stripe price IDs) and any new metered add-on (e.g. batch-row pack).
   - Extend `METRIC_TO_LIMIT_MAPPING` / `METRIC_TO_USAGE_MAPPING` for new metrics.

### 7.2 — Plan entity + migration (`packages/server/api`)
3. **`platform-plan.entity.ts`**: add the new columns (cap fields + any new flags).
   Follow `.claude/rules/entity-registration.md` — no new *entity*, but new columns.
4. **New migration** (additive, idempotent, registered in `getMigrations()`):
   - `ALTER TABLE platform_plan ADD COLUMN` for each new cap/flag (defaults chosen so
     existing rows behave as today — e.g. caps default to the current hardcoded
     values `500/3/10`, `reasoningAllowed=false`, monthly caps generous).
   - Backfill: set existing `standard` rows to the equivalent new plan.
   - (If promoting the two DB-only flags into the shared contract, this migration is
     also where their column defs get reconciled — but they already exist, so just
     surface them in the entity/type.)

### 7.3 — Plan seeding & resolution
5. **`platform-plan.service.ts`**
   - Extend `seedPlanByEdition()` / `createInitialPlan()` to seed the right default
     (Free tier for a new Cloud signup; `OPEN_SOURCE_PLAN` for EE/CE unchanged).
   - Add **new limit-enforcement methods** mirroring `checkActiveFlowsExceededLimit`:
     e.g. `checkAgentActionsExceededLimit(platformId)` that reads the monthly
     `AgentUsageMetric` counter vs the plan cap and throws `QUOTA_EXCEEDED`.
6. **New `browserAgentPlan` resolver** (thin service or an extension of the tenancy
   service): given a `platformId`, return the resolved agent caps + `reasoningAllowed`
   + `recallTier` from the plan row. This is the single place the runtime/automation
   read from.

### 7.4 — Wire the five already-parameterized browser-agent seams  ✅ DONE
All five now read from the `browserAgentPlan` resolver
(`browser-agent/usage/browser-agent-plan.service.ts`):
7. **Batch caps** ✅ — `browser-agent-automation.controller.ts` passes
   `caps: { maxBatchRows, maxConcurrentRows }` into `batchService.create(...)` (both
   the structured + upload routes).
8. **Schedule cap** ✅ — the schedule-create route passes `maxSchedules`.
9. **Reasoning tier** ✅ — `drive()` sets `reasoningAllowed: caps.reasoningAllowed`
   in `EngineDeps` (was hardcoded `false`).
10. **Memory recall depth** ✅ — `buildMemoryContext` uses `caps.recallTier` (was
    hardcoded `'free'`). **Superseded (0.103.0):** it now reads that from `memoryPlan`
    (`memoryCaps.recallTier`), not from `browserAgentPlan` — memory is its own door (§8a).
11. **Sharing** ✅ — `browser-agent-batch.service.ts` `list()` resolves
    `sharingUnlocked` via `browserAgentTenancyService.isSharingUnlocked(platformId)`.

### 7.5 — Browser-agent metering  ✅ DONE
12. **`browserAgentUsage` service** ✅ (`browser-agent/usage/browser-agent-usage.service.ts`):
    atomic `INSERT … ON CONFLICT (platformId, period, metric) DO UPDATE count = count + 1
    RETURNING count`; `meter()` (check-then-increment), `increment()` (count-only),
    `currentCount()`, `currentUsage()`. `agentScope`-exempt (platform-pooled counter,
    documented).
13. **Bump at every seam** ✅ — `dispatchTool` meters ACTIONS/RESEARCH/FILE_OPS/
    MEMORY_OPS via the shared `agentUsage.metricForToolName` map (free/read tools
    unmetered); `startReplayRun` + `startBatchRow` meter ROUTINE_RUNS; the grammar
    controller meters QUICK_TOOLS.
14. **Enforce before the costly action** ✅ — `meter()` checks the monthly count vs
    the plan cap first (Nth+1 refused, not counted); over-cap / not-on-plan →
    `FEATURE_DISABLED` with an upgrade prompt; fail-open on metering error.
15. **Usage read surface** ✅ — `GET /v1/browser-agent/usage` (used vs cap per metric).
    Tests: 15 new unit tests; full browser-agent suite 150/150.

> **The only follow-on for this slice** is repointing the resolver's `resolveTier`/
> `capsForPlatform` swap point at the real `platform_plan` cap columns once §7.1–7.2
> land — no call site changes. Until then it maps the plan **name** + `browserAgentEnabled`
> onto the tier→caps table.

### 7.6 — Gating (reuse existing mechanisms)
15. **Server**: gate the browser-agent module with the existing pattern —
    `platformMustHaveFeatureEnabled((p) => p.plan.browserAgentEnabled)` as a
    `preHandler` on `browserAgentModule` (today it's registered edition-only + read
    via raw SQL; add the plan-flag preHandler so it matches every other feature).
    Gate Studio-only capabilities that shouldn't appear on Agent-only plans similarly.
16. **Frontend**: `LockedFeatureGuard locked={!platform.plan.<flag>}` for each
    product surface (Agent tab, Flows builder, batch/schedule UI, team features).
    Use `enabled: platform.plan.<flag>` on the relevant queries.
17. **Billing UI**: reuse the existing billing page; add the new plan cards and the
    `CAN_BUY_*` `IbFlagId` toggles to reveal Agent/Flows purchase where applicable.

### 7.7 — Stripe (Cloud only)
18. **`stripe-helper.ts` + `stripe-billing.controller.ts`**: add the new base-plan
    price IDs; extend `changeSubscription`/`onSubscriptionChanged` to reconcile the
    new plan → set `plan` (`PlanName`), flags, caps, `includedAiCredits`,
    `activeFlowsLimit`, `browserAgentEnabled`. Keep the `active-flow` and `ai-credit`
    add-ons as-is (they compose with any plan). Deferred downgrade / immediate upgrade
    mechanics are unchanged.
19. **Product scope on signup**: the signup already carries `productScope`
    (BROWSER/BLOCKUNITS/FULL). Map the chosen door → default plan + `browserAgentEnabled`
    via the existing `applyProductScope` seam.

### 7.8 — Editions safety
- All new plan constants/flags live in the shared/EE layer; **CE is untouched**
  (still `OPEN_SOURCE_PLAN`, no billing, browser-agent module not registered).
- **EE** seeds unlimited (`OPEN_SOURCE_PLAN`) + license-key activation — new caps
  default to unlimited/on there.
- Never import `enterprise/` from CE (rule). New billing logic stays under
  `enterprise/platform/platform-plan/`.

---

## 8. Key design decision — where the Agent caps live

Two viable placements for the browser-agent caps (batch/schedule/reasoning/recall +
the six monthly caps):

- **Option 1 (recommended for the redesign): promote into `platform_plan`** — add the
  columns to the entity + shared `PlatformPlan`. **Pros:** one plan row is the single
  source of truth; frontend can gate/display them; Stripe reconciler sets them like
  any other limit; consistent with how `activeFlowsLimit`/`includedAiCredits` work.
  **Cons:** touches the shared contract (a deliberate, versioned change).
- **Option 2 (minimal-touch): keep them DB-only** like `browserAgentEnabled`, resolved
  by a `browserAgentPlan` service via scoped raw SQL. **Pros:** shared `PlatformPlan`
  stays byte-for-byte unchanged (the Phase-1/2 design intent). **Cons:** two sources of
  plan truth; the frontend can't read caps from `platform.plan.*` without a new
  endpoint.

**Recommendation:** since this is explicitly a *plan/billing redesign*, choose
**Option 1** — promote the Agent caps into the plan and treat the whole dual product
as one coherent entitlement surface. The tenancy service's raw-SQL flags
(`browserAgentEnabled`, `agentSharingUnlocked`) can either be promoted too or kept as
the "product-scope" toggle they are today; keep `agentSharingOptIn` on `user` (it's a
per-user preference, not a plan field).

---

## 8a. Memory is a THIRD door — not an Agent cap  ✅ SHIPPED (0.103.0)

Memory was originally packaged as a field inside the Agent's cap blob (`agentCaps.memoryEnabled` /
`.maxFacts` / `.recallTier`). That was wrong, and it shipped as a revenue defect: because the caps
resolver returns "nothing included" whenever `browserAgentEnabled` is false, **a Studio-only customer
could not use memory and could not even buy it** — no Studio tier could express "memory on, agent
off". Memory is a *cross-product* capability:

- **Intellisper Agent** → personal memory (`USER` scope) — "my agent remembers me".
- **Intellisper Studio** → org (`PLATFORM`) + flow (`FLOW`) memory — shared team knowledge.

**Decision:** memory has its own entitlement blob (`platform_plan.memoryCaps`, shape `MemoryCaps`)
and its own resolver (`memoryPlan`) that **never reads `browserAgentEnabled`**. Merely resolving the
memory fields out of `agentCaps` while ignoring the agent door was rejected: a Studio tier would
still have to populate an *Agent* caps object to sell memory — the same coupling wearing a different
hat. Product scope now has three independent doors: **Agent**, **Studio**, **Memory**.

### Memory by tier (as shipped)

| Tier | Agent door | `memoryCaps` | maxFacts | Recall |
|---|---|---|---|---|
| `AGENT_FREE` / `STUDIO_FREE` / `COMPLETE_FREE` | — | `NONE` | 0 | — |
| `AGENT_STARTER` | ✅ | `STARTER` | 1,000 | free |
| `AGENT_PRO` | ✅ | `PRO` | 10,000 | pro |
| `STUDIO_STARTER` | ❌ | `STARTER` | 1,000 | free |
| `STUDIO_PRO` | ❌ | **`TEAM`** | 50,000 | pro |
| `TEAM_STUDIO` | ❌ | `TEAM` | 50,000 | pro |
| `TEAM_AGENT` / `TEAM_COMPLETE` | ✅ | `TEAM` | 50,000 | pro |
| `COMPLETE_STARTER` | ✅ | `STARTER` | 1,000 | free |
| `COMPLETE_PRO` | ✅ | `TEAM` | 50,000 | pro |
| Enterprise edition | ✅ | `ENTERPRISE` | unlimited | enterprise |

**Free = memory OFF, on both products.** Memory's COGS is durable, not per-session (an embedding on
every remembered fact *and* every recall, plus vector storage + index upkeep that persist for the
life of the account). On a free account that never converts, that cost accrues forever. It is also
the natural first upgrade: "your agent/your flows remember you" is a concrete thing to buy.

### ⚠️ OPEN PRICING DECISION — `STUDIO_PRO` memory budget

`STUDIO_PRO` is currently set to `MEMORY_CAPS_TEAM` (50k facts), **not** `MEMORY_CAPS_PRO` (10k).

The reasoning: `maxFacts` is a **per-user** ceiling, but org memory is **one shared corpus** for the
whole platform, so the same number means different things. Agent Pro's 10k is one person's lifetime
of preferences and contacts — generous. Studio Pro (`projectsLimit: 3`) is the first genuinely
multi-user Studio tier, and its org memory is collective: house style, key accounts, tone rules, and
per-flow learnings accumulated across many runs. At 10k a small team could plausibly hit the ceiling
and start seeing "memory is full" — a failure landing on a paying customer, from a cap that was
never sized for shared use. So it was sized by *who fills the corpus*, not by tier name.

**Why this needs an owner decision (it is a margin call, not a technical one):**
- Studio Pro is **$39/mo flat**; Team Studio is **$28/seat** (min 3 seats = $84/mo). At ≥3 seats,
  Team Studio bills more but currently gets the **same** memory budget. If memory should be a reason
  to move up to Team, set `STUDIO_PRO: MEMORY_CAPS_PRO`.
- Counter-argument for keeping `TEAM`: Studio Pro's value story *is* shared team knowledge; a
  too-tight corpus makes the tier's headline feature feel broken rather than makes Team attractive.
- The numbers are launch guesses inherited from §3's "re-tune from telemetry" stance — **50k is not
  derived from data**, and neither is 10k.

One-line change either way in `packages/shared/src/lib/ee/billing/index.ts`. Revisit with the §9.4
telemetry (actual facts-per-account by tier) before it is worth defending.

### Also open (NOT a pricing question)

`PLATFORM`/`FLOW` memory has **no consumers** — no flow step, copilot or MCP surface reads or writes
it yet. A Studio customer can buy, see and curate org memory, but automations do not consult it.
That is feature work with its own design (which step types read memory, at what scope, with what
recall budget). Until it lands, do not market org memory as something flows *use*. See
`docs/rewrite/memory-studio-gap.md`.

---

## 9. Metering — the hard dependency  ✅ BUILT

This was the critical path: nothing could be *enforced* on the Agent side until the
`browser_agent_usage_counter` was actually written. **It now is** (§7.5). The six
monthly counters increment atomically at every consumption seam and are checked
against plan caps before the costly action; the five parameterized cap seams read
from the `browserAgentPlan` resolver. So the Agent-side caps are **enforceable
today**, keyed off the plan the resolver reports.

**Remaining sequencing (the plan/packaging rollout — handoff in §11):**
1. Ship the **plan constants + `PlanName` tiers + `platform_plan` cap columns +
   migration** (§7.1–7.2), then repoint the resolver's swap point at those columns.
2. Ship **flag-gating** (server `platformMustHaveFeatureEnabled` + frontend
   `LockedFeatureGuard`) + the **usage-meter UI** (backed by the new
   `GET /v1/browser-agent/usage`).
3. Ship **Stripe wiring** for the new plans (§7.7) + product-scope→default-plan.
4. Instrument, collect ~30 days of `tokenCost`/counter data, then **re-tune caps and
   prices for v2** against measured p50/p90 — the amounts here are the defensible
   starting point, not the final word.

---

## 10. Summary checklist

- [x] **Agent metering** — atomic counter bump at every seam + enforce (§7.5).
- [x] **Wire the 5 parameterized Agent seams** to a caps resolver (§7.4).
- [x] **Usage read surface** (`GET /v1/browser-agent/usage`).
- [x] **AI-credit unification** — the Agent now draws its AI from the SAME platform
      credit pool as Studio (routed through the managed key, so a turn debits
      `includedAiCredits` exactly once); self-hosted keeps its own key. Prompt-caching and
      billed-token accounting are preserved; exhaustion surfaces as a terminal
      "AI credit limit exceeded" rather than a retry storm.
- [x] Name the automation side **Studio** (§0 hard requirement — this supersedes the
      "Flows" recommendation in §1; the document's own copy was corrected to match).
- [x] Shared (**0.98.0**): `PlanName` + the 12 new tiers; Agent caps **promoted into**
      `PlatformPlan` (§8 Option 1) as one `agentCaps` blob (a tier is written atomically —
      no half-applied entitlement) plus the two Agent flags; 12 plan-seed constants;
      `PLAN_LIMITS_BY_NAME` / `planLimitsForName()` as the single tier→entitlement
      authority; `PLAN_MONTHLY_PRICE_USD` / `BILLABLE_PLANS`.
- [x] Entity + migration (`3169900000002`, additive + idempotent) with a
      **behavior-preserving backfill**: every existing platform materialises exactly the
      tier the old plan-name heuristic gave it, so the repoint of
      `browserAgentPlan.capsForPlatform` onto the real columns changes nobody's
      entitlements. **Verified against the live DB** (executed, recorded, indexed,
      backfill correct, re-run is a no-op).
- [x] Seed new tiers on signup: `productScope` → the FREE tier of that door
      (BROWSER → Agent Free, BLOCKUNITS → Studio Free, FULL → Complete Free), written in
      one guarded statement that can never clobber a paid plan.
- [x] Gate with `platformMustHaveFeatureEnabledOrPaymentRequired` (server) — the Agent's
      product surfaces return **402** when the plan does not include it. Health and
      tenancy are deliberately ungated: tenancy is *how* a platform adopts the Agent, so
      gating it on the flag it sets would lock users out.
- [x] Stripe: tier↔price is one env-supplied JSON map (no hardcoded price IDs); the
      webhook applies the subscribed tier's **whole** entitlement set, refuses to guess
      when no recognised base-plan price is on the subscription, and drops a cancelling
      customer to the free tier of the product they actually use. *(Also fixed a real
      pre-existing bug: extra-active-flows was matched against the base item's own price,
      so a base quantity such as seats silently became an active-flow grant.)*
- [ ] **Frontend**: `LockedFeatureGuard` cards per surface + the usage-meter UI (the
      `GET /v1/browser-agent/usage` endpoint it reads is already shipped). This is the one
      remaining piece of §7.6.
- [ ] Ship, instrument, re-tune in v2 from real telemetry (§9.4).

**Rollout verification:** api typecheck at baseline (0 errors in the new code) ·
billing **45/45** (plan-constant invariants, caps resolver, price map, Stripe reconcile
incl. the regression above) · browser-agent **170/170** · live migration applied and
idempotent.

*Prices here are a launch starting point, grounded in modeled COGS; they will be
updated once real usage data exists.*

---

## 10a. AI Gateway — measuring the actual COGS

This whole document prices against **modeled** AI cost. The AI Gateway is what replaces
the model with measurement. Full design: [`AI_GATEWAY_DESIGN.md`](./AI_GATEWAY_DESIGN.md).

**Why it was needed.** AI inference is our largest variable cost, and we could not see it.
The `ai_usage` table had been dropped, there was no per-token price map anywhere, and
"AI spend" was a read-through of OpenRouter's key ledger at a flat 1000 credits = $1. So
every call that did *not* route through that key — Anthropic-direct, OpenAI-direct,
Bedrock, Azure, Gemini — contributed **exactly zero** to our cost picture. We were pricing
plans against a number with a structural hole in it.

**What shipped.** One platform-owned ledger (`ai_usage_ledger`) with a row per AI call
across **all** metered execution planes, recording raw tokens separately from money so any
window can be re-costed:

| Plane | How it's captured |
|---|---|
| Browser agent (API) | model wrapped at its single `buildModel` funnel |
| Studio chat (worker) | model wrapped in `createChatModel`; usage returned over the existing Socket.IO RPC |
| Flow AI blocks (engine) | model wrapped in `createAIModel`/`createEmbeddingModel`; reported on the engine-JWT channel, tenant taken from the **token**, not the payload |

Key properties, each enforced and tested:

- **No proxy, no added latency.** We do NOT route through a self-hosted gateway (the
  approach the source spec proposed) — that adds a hop to every call and a single point of
  failure for all AI. Instead the AI SDK's own middleware reads the usage the provider
  already returns on the response we're already awaiting. Zero extra requests; a metering
  failure can never break, delay, or alter an inference call.
- **Provider is the source of truth.** When a provider reports its own USD cost (OpenRouter
  does) we record it verbatim; otherwise we compute from a versioned, effective-dated price
  table. Every row is tagged `provider | computed | unpriced`, so a report never blends
  measured and estimated money silently, and an unknown model shows up as *unpriced volume*
  rather than as free.
- **Correct cost math.** Cache **writes** bill at a premium (Anthropic 1.25×), not the
  90% *discount* the source spec assumed — that error would have under-counted the browser
  agent, which caches every turn. And the Anthropic-vs-OpenAI difference in what
  `inputTokens.total` includes is normalized away, so cached tokens are never double-counted.
- **No double-counting across retries.** A unique idempotency key makes a re-delivered
  report a no-op; a retried run re-emits the same keys and the DB collapses them.
- **Read surface.** `GET /v1/ai-gateway/spend` (a platform's own COGS vs. revenue vs. margin,
  by product surface and model) and `/spend/admin` (operator: spend across tenants — the
  number this plan's prices must actually cover), surfaced in the admin UI under Observability.

Two live **revenue leaks** were found and fixed on the way: the research tool and memory
embeddings were running on env keys, so that spend never debited the customer's credit pool.

*Verified:* api typecheck at baseline · full API unit suite **734/734** (incl. new AI-gateway
suites: cost math, sink, middleware) · migration applied to the live DB and idempotent.

---

## 11. Handoff prompt for the implementing agent

> Paste the block below to the agent that will implement the remaining plan rollout.
> The metering + cap foundation (§7.4–7.5, §9) is already built and tested — that
> agent builds the plan/packaging layer on top of it.

```
You are implementing the subscription-plan rollout for Intellisper (blockunits) — a
rebranded Activepieces fork with two products in one server: the automation platform
("Flows") and the ported browser agent. Work ONLY inside the `blockunits` folder.
Read these first, in order:
  1. docs/pricing-model/SUBSCRIPTION_PLANS_PROPOSAL.md  (the full plan design)
  2. docs/pricing-model/COST_MODEL_METHODOLOGY.md + cost-model.csv  (the COGS basis)
  3. AGENTS.md + .claude/rules/*  (repo rules: entity-registration, data-isolation,
     edition-safety, safe-http)

WHAT IS ALREADY BUILT (do NOT rebuild — build ON it):
  The browser-agent metering + cap-enforcement layer is DONE, wired into every
  consumption path, and tested (150/150 browser-agent unit tests; api typecheck
  clean at 27 = below the 28 baseline). Specifically:
   - packages/server/api/src/app/browser-agent/usage/browser-agent-usage.service.ts
     — atomic INSERT..ON CONFLICT counter (meter/increment/currentCount/currentUsage),
     agentScope-exempt (platform-pooled).
   - .../usage/browser-agent-plan.service.ts — the browserAgentPlan caps RESOLVER,
     with a SINGLE swap point (`resolveTier` / `capsForPlatform`). It currently maps
     the platform's plan NAME + `browserAgentEnabled` onto a tier→caps table
     (CAPS_BY_TIER) that matches the proposal's Agent tiers.
   - Metering hooked in: dispatchTool (ACTIONS/RESEARCH/FILE_OPS/MEMORY_OPS via the
     shared `agentUsage.metricForToolName` map), startReplayRun + startBatchRow
     (ROUTINE_RUNS), grammar controller (QUICK_TOOLS).
   - All 5 parameterized seams wired to the resolver: batch caps, maxSchedules,
     reasoningAllowed, memory recallTier, sharingUnlocked.
   - GET /v1/browser-agent/usage returns used-vs-cap per metric.
   - @intelblocks/shared @ 0.97.0 exports: `agentUsage`, `BrowserAgentCaps`,
     `UNLIMITED_CAP`, `AgentUsageSummaryResponse`, `AgentUsageProjectRequest`.

YOUR JOB — the plan/packaging layer (proposal §7.1–7.3, §7.6–7.8), in this order:
  1. SHARED (packages/shared): extend `PlanName` with the new tiers (precedent:
     appsumo_intellisper_tier1..6); add the browser-agent cap columns to the
     `PlatformPlan` shape (the proposal §8 recommends PROMOTING them into the plan —
     do that); extend `PlatformUsageMetric` if you want the automation-side usage
     read to include agent metrics; add new plan-seed constants in ee/billing/index.ts
     (copy STANDARD_CLOUD_PLAN) per proposal §3/§5; add PRICE_NAMES + PRICE_ID_MAP
     entries (dev/prod Stripe price IDs). Bump shared (minor).
  2. ENTITY + MIGRATION (packages/server/api): add the new `platform_plan` columns to
     platform-plan.entity.ts; write ONE additive idempotent migration (register in
     getMigrations()) that ADD COLUMNs with defaults = today's behaviour (caps 500/3/10,
     reasoningAllowed=false, generous monthly caps), and backfills existing `standard`
     rows. Follow .claude/rules/entity-registration.md.
  3. REPOINT THE RESOLVER: change ONLY `browserAgentPlan.resolveTier`/`capsForPlatform`
     to read the new plan columns instead of the name heuristic. No call site changes
     (that is the whole point of the seam).
  4. SEED: extend platform-plan.service.ts seedPlanByEdition()/createInitialPlan() to
     seed the right default tier (Free for a new Cloud signup; OPEN_SOURCE_PLAN for
     EE/CE unchanged).
  5. GATING: server — add `platformMustHaveFeatureEnabled((p)=>p.plan.browserAgentEnabled)`
     preHandler on browserAgentModule (+ gate Studio-only capabilities). Frontend —
     `LockedFeatureGuard locked={!platform.plan.<flag>}` per product surface + a usage
     meter UI backed by GET /v1/browser-agent/usage.
  6. STRIPE (Cloud only): add the new base-plan price IDs; extend stripe-helper.ts
     changeSubscription + stripe-billing.controller.ts onSubscriptionChanged to
     reconcile the new plan (set plan/PlanName, flags, caps, includedAiCredits,
     activeFlowsLimit, browserAgentEnabled). Keep the active-flow + ai-credit add-ons.
  7. SIGNUP SCOPE: map the existing signup `productScope` (BROWSER/BLOCKUNITS/FULL) →
     default plan + browserAgentEnabled via the existing applyProductScope seam.

HARD RULES: additive + backward-compatible (existing `standard` platforms behave
exactly as today until migrated); CE untouched (no billing, browser-agent module not
registered there); never import enterprise/ from CE; use safeHttp for outbound HTTP;
new entities/columns must be registered (entity-registration rule). Amounts/limits are
the proposal's STARTING POINT — wire them so they're env/DB-tunable, and expect a v2
re-tune once GET /v1/browser-agent/usage + AgentRun.tokenCost yield real telemetry.

VERIFY like this pass did: api typecheck must stay ≤28 (0 in your files); run the
browser-agent unit suite (WINRUN_INCLUDE='test/unit/app/browser-agent/**/*.test.ts'
npx vitest run --config vitest.winrun.mts — must stay 150/150+); add tests for new
plan seeding + Stripe reconcile + gating. Do NOT push unless asked.
```
