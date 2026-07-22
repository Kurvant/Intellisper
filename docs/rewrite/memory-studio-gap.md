# DEFECT: Memory is unusable and unsellable without an agent subscription

> Status: **FIXED** (release 0.103.0). Memory is now a standalone, cross-product capability: a
> Studio-only platform can buy and use it with no agent. The couplings described below are resolved;
> the write-up is kept because it documents *why* the architecture changed.
>
> **One piece remains open and is NOT part of the fix** — see "Still open" at the end: `PLATFORM` /
> `FLOW` scopes have no consumers (flow steps / copilot / MCP), so org memory is API/UI-complete but
> does nothing for Studio until those land. That is feature work needing its own design.
>
> ## What landed
> - **Entitlement decoupled** — memory's caps moved OUT of `agentCaps` into their own
>   `MemoryCaps` blob (`packages/shared/src/lib/memory/memory-caps.ts`, persisted as
>   `platform_plan.memoryCaps`). New resolver `memoryPlan` (`server/api/src/app/memory/
>   memory-plan.service.ts`) reads ONLY that column and never consults `browserAgentEnabled`.
>   Resolving memory out of `agentCaps` was rejected: it would still force a Studio tier to populate
>   an *agent* caps blob to sell memory — the same coupling in disguise.
> - **Routes decoupled** — new `memoryModule` registers the memory controllers OUTSIDE the
>   agent-gated child plugin, at `/v1/memory/*` and `/v1/admin/memory/*`. The old
>   `/v1/browser-agent/memory/*` paths are retained **verbatim and indefinitely** as aliases (the
>   browser extension is an external client that cannot be force-upgraded).
> - **Billing** — `STUDIO_STARTER`, `STUDIO_PRO` and `TEAM_STUDIO` now sell memory with the agent
>   door shut. Free tiers keep memory OFF on both products (memory's COGS accrues for the life of an
>   account, and "your flows remember" is the first thing a paid tier buys).
> - **Migration** `3169900000005` adds the column and backfills it by projecting each platform's
>   EXISTING `agentCaps` memory fields, so no live platform gains or loses anything.
> - **Frontend** — memory nav (member + admin) no longer gated on `browserAgentEnabled`; the
>   agent-only upgrade copy is now product-neutral.
>
> Verified: 1419 tests green (790 api / 427 shared / 202 web), lint 0 errors, and 5 proof cases
> against real Postgres — Studio-only resolves memory ENABLED with the agent shut; a platform with
> neither is denied; an agent platform is unchanged; the backfill preserves entitlements exactly and
> grants nothing to a platform that never bought memory.

## Original report (kept for context)

## Intended behaviour (owner)
Memory is a **shared, cross-product capability**:
- **Intellisper agent** → personal memory (`USER` scope) — "my agent remembers me".
- **Intellisper Studio** → **org memory** (`PLATFORM`) + **flow memory** (`FLOW`) — shared team
  knowledge that flows draw on.
Memory must be purchasable and usable on a **Studio-only** subscription, with **no agent required**.

## Actual behaviour (confirmed)
A Studio-only platform gets **402 on every memory route, including org memory**. Memory cannot even be
sold to them. Three independent couplings cause this:

### 1. Route gate — `packages/server/api/src/app/browser-agent/browser-agent.module.ts`
- `:44` `await app.register(async (gated) => {`
- `:45` `gated.addHook('preHandler', platformMustHaveFeatureEnabledOrPaymentRequired((platform) => platform.plan.browserAgentEnabled))`
- `:54` `gated.register(browserAgentMemoryController, { prefix: '/v1/browser-agent/memory' })`
- `:58` `gated.register(browserAgentMemoryAdminController, { prefix: '/v1/browser-agent/admin/memory' })`

Both memory controllers sit **inside** the agent-gated child plugin → any platform without the agent
door gets 402 on `/v1/browser-agent/memory/*` and `/v1/browser-agent/admin/memory/*`.

### 2. Caps gate — `packages/server/api/src/app/browser-agent/usage/browser-agent-plan.service.ts:99-100`
```ts
// The agent is a product-scope door: closed → nothing is included, whatever the caps say.
if (!row || row.browserAgentEnabled !== true) {
    return AGENT_CAPS_NONE
}
```
`memoryEnabled` is read from `capsForPlatform(...)`, so it **can never resolve true** without
`browserAgentEnabled`. Even if the route gate were removed, memory would still be denied.

### 3. Billing — `packages/shared/src/lib/ee/billing/index.ts:352-375`
`STUDIO_FREE_PLAN` (`:352`), `STUDIO_STARTER_PLAN` (`:360`), `STUDIO_PRO_PLAN` (`:368`) set **neither
`browserAgentEnabled` nor `agentCaps`** — they only set `includedAiCredits` / `activeFlowsLimit` /
`projectsLimit` (+ `chatEnabled` on Pro). Only the COMPLETE/bundle tiers set the agent flags
(e.g. `:388-389` `browserAgentEnabled: true, agentCaps: AGENT_CAPS_FREE`).
→ There is **no tier that sells memory to a Studio customer**.

### 4. Entitlement shape — `packages/shared/src/lib/browser-agent/file-audit-usage.ts`
`memoryEnabled` (`:176`), `maxFacts` (`:182`), `recallTier` (`:166`) are fields **inside
`BrowserAgentCaps`** — i.e. memory's entitlement is structurally a sub-field of the *agent's* cap blob.

### 5. Edition boundary — `packages/server/api/src/app/app.ts:298, 335`
`browserAgentModule` is registered only under CLOUD (`:298`) and ENTERPRISE (`:335`). If Studio memory
must work on COMMUNITY/self-hosted, the module boundary must change too.

### Corroborating symptoms
- Namespace: memory lives under `/v1/browser-agent/memory/*` — a Studio customer's org memory is served
  from an "agent" URL.
- Entitlement blob: `memoryEnabled`, `maxFacts`, `recallTier` live inside **`agentCaps`**.
- Upgrade copy is agent-only: *"Upgrade to let your **agent** remember across tasks."*
- Agent tools hardcode `AgentMemoryScope.USER` — the agent cannot write org memory.
- **No code outside `browser-agent/` imports the memory service** — `PLATFORM`/`FLOW` scopes are
  API/UI-complete but not consumed by flows/copilot/MCP.
- Product copy already promises the opposite: the memory page calls org memory *"Shared team knowledge
  your flows and agents can draw on"*, and `domain-nav.ts` calls memory *"a separate paid capability"*
  on top of the agent door.

**Conclusion:** the intent was clearly a shared capability; the implementation nested it inside the
agent product. This is an architectural coupling defect, not a missing feature — the memory feature
itself (scopes, visibility, governance, caps) is built.

## What a fix requires (sketch — needs its own design + approval)
1. **Decouple entitlement:** hoist `memoryEnabled` / `maxFacts` / `recallTier` out of `agentCaps` into
   a memory entitlement resolvable from the platform plan independently of `browserAgentEnabled`
   (or make `capsForPlatform` resolve memory fields even when the agent door is closed).
2. **Decouple routes:** register the memory controllers **outside** the agent-gated child plugin,
   behind their own `memoryEnabled` gate. Consider re-namespacing to `/v1/memory/*` (breaking → needs
   a redirect/deprecation path for the extension).
3. **Billing:** add memory to the `STUDIO_*` tiers (and decide the Free-tier stance — today Free =
   memory OFF on the agent side).
4. **Wire Studio consumers:** `PLATFORM`/`FLOW` scopes need real consumers (flow steps / copilot /
   MCP) for org memory to mean anything to Studio. This is the largest piece and is **feature work**,
   not a fix.
5. **Edition:** the whole `browserAgentModule` is CLOUD/ENTERPRISE-only. If Studio memory must work on
   COMMUNITY/self-hosted, the module boundary must change too.
6. Update the agent-framed upgrade copy.

## Consumers — WIRED (release 0.104.0)

Org/flow memory is now actually read and written by Studio. Two consumers landed:

**1. Studio copilot** (`chat-config.service.ts` → `buildCopilotMemoryContext`). The copilot is an
interactive surface with a real `userId`, so it recalls the user's OWN personal facts *and* the org's
shared knowledge into its system prompt. Honours the user's auto-recall switch; best-effort (a memory
fault never breaks a conversation).

**2. AI Agent flow step** (`packages/blocks/community/ai` → `agents` action, block **0.5.0**). Two
new opt-in props, modelled on the existing `WEB_SEARCH` precedent:
- `MEMORY_RECALL` — recalls org + this-flow memory into the step's prompt.
- `MEMORY_CAPTURE` — offers the model a `remember` tool that saves durable facts to **FLOW** scope,
  so later runs of that flow can use them.
Both default OFF: recall spends an embedding per run, so a flow executing thousands of times a month
must not incur that cost unasked.

### The trust boundary (why a flow can never touch personal memory)
Flow steps reach memory through a dedicated engine surface (`/v1/memory/engine/{recall,remember}`,
`securityAccess.engine()`), NOT the member routes. An `EnginePrincipal` carries `projectId` +
`platform.id` but deliberately **no `userId`** — an unattended run has no person behind it. So:
- **USER scope is absent from the engine request contract entirely** — a flow cannot even express the
  request, rather than being stopped by a check someone could later forget.
- `platformId`/`projectId` come from the token; body values are stripped by the schema.
- `flowId` arrives in the body (the token has none), so it is verified via
  `flowService.getOne({ id, projectId })` before FLOW scope is granted — a flow naming another
  project's id finds nothing.
- Every path degrades quietly: no memory on the plan, no embedding key, provider down → the step runs
  without memory rather than failing the customer's automation.

Verified live against a real signed engine token: USER recall/write → 400 (contract rejects), org
recall → 200, foreign `flowId` → 0 facts, body `platformId` ignored. Plus 7 contract tests.

### Still open
**MCP** has no memory consumer yet — deliberately deferred as lower value until the two above prove
out in real use.

Also unchanged: `memoryModule` is registered under CLOUD and ENTERPRISE only, matching
`browserAgentModule`'s existing edition boundary. If Studio memory must work on COMMUNITY/self-hosted,
that is a separate decision — it was not made unilaterally here.

## Impact on the documentation overhaul
- **Memory may now be documented as available to Studio** — the entitlement, routes and billing all
  support it as of 0.103.0.
- **Flows using org/flow memory is now TRUE as of 0.104.0**, with one precise caveat: it is **opt-in
  per AI Agent step** (`Use memory` / `Remember what it learns`), not automatic. Document it as a
  capability an author switches on, never as something every flow does by default. The copilot's
  recall is automatic (subject to the user's auto-recall switch).
- **Options (owner decision):**
  - **(a) Fix first, then document the fixed behaviour** — docs describe the intended shared
    capability. Requires the code work above to land before Phase C4b.
  - **(b) Document today's behaviour** (memory requires the agent) and revise the docs after the fix.
  - **(c) Sequence:** proceed with the docs migration now (Phases 0→M5 are platform/structure work and
    are unaffected), and decide (a)/(b) before Phase **C4b** (the Memory section) — which is where the
    question actually bites.
- **Recommendation: (c) then (a).** The migration phases don't touch this, so it is not blocking; but
  the Memory docs should describe the corrected model rather than enshrine a defect that is about to
  change.
