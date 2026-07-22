# Intellisper (blockunits) — Plans, Quotas & Pricing Report

**Generated:** 2026-07-14
**Source of truth:**
- `packages/shared/src/lib/ee/billing/index.ts`
- `packages/server/api/src/app/enterprise/platform/platform-plan/platform-plan.service.ts`
- `packages/server/api/src/app/enterprise/platform/platform-plan/platform-ai-credits.service.ts`
- `packages/shared/src/lib/management/platform/platform.model.ts` (`PlanName` enum)

Plans are **per-platform (organization)**, not per-user.

---

## There are effectively 3 plan archetypes (only 2 named plans exist: `standard`, `enterprise`)

| | **Open-Source / Community** (self-host) | **Standard** (managed Cloud) | **Enterprise** |
|---|---|---|---|
| `plan` value | *(none)* — `OPEN_SOURCE_PLAN` | `standard` | `enterprise` |
| Active flows | unlimited (`activeFlowsLimit` unset) | **10** included | unlimited / negotiated |
| Projects | 1 | **1** | negotiated |
| Team projects | ONE | ONE | negotiated |
| Included AI credits | **0** | **200** / month | negotiated |
| Analytics | ✅ | ✅ | ✅ |
| Tables, Agents | ✅ / ✅ | ✅ / ✅ | ✅ / ✅ |
| AI providers (BYO) | ✅ | ❌ | negotiated |
| SSO, SCIM, audit log, API keys, custom roles, global connections, secret managers, environments, embedding, custom appearance, manage-blocks/templates, custom domains, dedicated workers, event streaming, chat, data-manipulation | ❌ (all off) | ❌ (all off) | ✅ (license-gated) |

Enterprise has **no hardcoded limit object** — it is seeded from `OPEN_SOURCE_PLAN` and its entitlements are set by **license key** / Stripe subscription reconciliation (negotiated), not fixed constants.

---

## Pricing (hardcoded)

- **Extra active flows:** `PRICE_PER_EXTRA_ACTIVE_FLOWS = $5 / flow / month` (Standard starts at 10 included; more are bought as an add-on). Stripe `active-flow` price.
- **AI credits:** `CREDITS_PER_CURRENCY_UNIT = 1000` → **1,000 credits = $1** (purchased / top-up). Stripe `ai-credit` price.
- **Included AI credits renew monthly** (Standard: 200/mo), guarded so renewal happens at most once per calendar month (`lastFreeAiCreditsRenewalDate`).
- **AI-credit auto-top-up:** optional — configurable min-threshold, credits-to-add, and an optional monthly cap (`maxAutoTopUpCreditsMonthly`).

---

## Subscription mechanics

- `IbSubscriptionStatus`: `active` | `canceled`. Billing period defaults to the **calendar month** if no Stripe subscription (`stripeSubscriptionStartDate` = start of month, `stripeSubscriptionEndDate` = end of month).
- Metered usage: **only `ACTIVE_FLOWS`** is metered/limited (`activeFlows` vs `activeFlowsLimit`); a null limit = unlimited (never denies).
- Stripe price IDs are environment-split (dev/prod) in `PRICE_ID_MAP`:
  - `ai-credit`: dev `price_1SfgNxKTWXpWeD7hmDBG4YMZ`, prod `price_1Rnj5bKZ0dZRqLEKQx2gwL7s`
  - `active-flow`: dev `price_1SQbbYQN93Aoq4f8WK2JC4sf`, prod `price_1SQbcvKZ0dZRqLEKHV5UepRx`
- `AppSumo` plans exist as a variant (`APPSUMO_PLAN`): a clone of Standard with `activeFlowsLimit` unset (unlimited active flows) and `eventStreamingEnabled: false`.
- Seeding by edition (`seedPlanByEdition`): `CLOUD` → `STANDARD_CLOUD_PLAN`; `ENTERPRISE` / `COMMUNITY` / default → `OPEN_SOURCE_PLAN`.

---

## Two important caveats (accuracy)

1. **These are the Activepieces-origin billing constants.** There is **no Intellisper/Kurvant-specific pricing tier or custom quota value** layered on top — the numbers above ($5/flow, 200 credits, 10 flows, $1 = 1000 credits) are the fork's current values as-is.
2. There is **no "Free / Plus / Business" tier** in code — despite common SaaS naming, this app only has `standard` + `enterprise` + the self-host open-source set.

---

## Raw reference values

### `STANDARD_CLOUD_PLAN` (managed Cloud default)
```
plan: 'standard'
activeFlowsLimit: 10
projectsLimit: 1
teamProjectsLimit: ONE
includedAiCredits: 200
tablesEnabled: true
agentsEnabled: true
analyticsEnabled: true
aiProvidersEnabled: false
chatEnabled: false
dataManipulationEnabled: false
globalConnectionsEnabled: false
customRolesEnabled: false
environmentsEnabled: false
embeddingEnabled: false
eventStreamingEnabled: false
showPoweredBy: false
auditLogEnabled: false
manageBlocksEnabled: false
manageTemplatesEnabled: false
customAppearanceEnabled: false
projectRolesEnabled: false
apiKeysEnabled: false
ssoEnabled: false
secretManagersEnabled: false
scimEnabled: false
customDomainsEnabled: false
dedicatedWorkers: null
canary: false
aiCreditsAutoTopUpState: DISABLED
```

### `OPEN_SOURCE_PLAN` (self-host)
```
(no `plan` value)
activeFlowsLimit: (unset → unlimited)
projectsLimit: (unset)
teamProjectsLimit: ONE
includedAiCredits: 0
tablesEnabled: true
agentsEnabled: true
aiProvidersEnabled: true          # BYO AI providers allowed
analyticsEnabled: true
chatEnabled: false
dataManipulationEnabled: false
globalConnectionsEnabled: false
customRolesEnabled: false
environmentsEnabled: false
embeddingEnabled: false
eventStreamingEnabled: false
showPoweredBy: false
auditLogEnabled: false
manageBlocksEnabled: false
manageTemplatesEnabled: false
customAppearanceEnabled: false
projectRolesEnabled: false
apiKeysEnabled: false
ssoEnabled: false
secretManagersEnabled: false
scimEnabled: false
customDomainsEnabled: false
dedicatedWorkers: null
canary: false
aiCreditsAutoTopUpState: DISABLED
```

### Pricing / enum constants (`billing/index.ts`)
```
PRICE_PER_EXTRA_ACTIVE_FLOWS = 5          # $5 / active flow / month
CREDITS_PER_CURRENCY_UNIT   = 1000        # 1000 AI credits = $1
PlanName = { STANDARD = 'standard', ENTERPRISE = 'enterprise' }
IbSubscriptionStatus = { ACTIVE = 'active', CANCELED = 'canceled' }
PRICE_NAMES = { AI_CREDITS = 'ai-credit', ACTIVE_FLOWS = 'active-flow' }
```
