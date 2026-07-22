# C4b Memory section — code-grounding (verified, file:line-cited)

Highest-care section (personal data + privacy contract). **Trust CODE, not comments** — three comments
in the memory area are stale (assert "always private" while implementing scope/visibility/sharing).

Layout: canonical decoupled routes/resolver in `app/memory/*`; the service + admin + settings + legacy
alias in `browser-agent/memory/*`.

---

## ⚠️ CRITICAL CORRECTION to plan §3.1c — the "no consumer" HARD RULE is now OUTDATED

The plan (§3.1c, §3.2 memory) asserts: *"no code outside `browser-agent/` and `app/memory/` imports
the memory service; no flow, copilot or MCP surface reads or writes it — a governed store with no
consumers yet. Do NOT write 'your flows draw on org memory.'"*

**Verified by grep — this has changed. There IS now a consumer: the Platform Copilot.**
- `enterprise/chat/chat-config.service.ts` imports `browserAgentMemory`, `browserAgentMemorySettings`,
  and `memoryPlan` (lines 37-38, 44), and `buildCopilotMemoryContext` (lines 119-160) **recalls BOTH
  the user's USER-scope facts AND the org's PLATFORM-scope facts** and injects them into the copilot's
  system prompt (line 146-147, 205-206). Its own comment (122-123): *"this is the seam that makes 'stop
  repeating yourself' work in Studio."* Used by `chat-rpc-handlers.ts` = the Studio Platform Copilot.
- It is **best-effort**: gated by `memoryPlan.capsForPlatform` (memory on plan) AND the user's
  auto-recall setting AND pgvector availability; any memory fault is caught and ignored so it never
  breaks a conversation (line 125-127, 159).

**Consumer boundary (grep of packages/server + packages/engine + packages/worker):**
- ✅ Consumes memory: `browser-agent/*` (the agent) + `enterprise/chat/chat-config.service.ts` (the
  **Platform Copilot**).
- ❌ Does NOT consume memory: the flow **engine** (`packages/engine`), the **worker**, MCP surfaces,
  blocks. Grep found zero importers there.

**Doc consequence (accurate framing):**
- ✅ SAFE to write: *"The agent and the Studio Copilot draw on your memory."* (both are real consumers).
- 🚫 STILL do NOT write: *"your **flows** draw on org memory"* — flows/automations/MCP do not consult it.
- The old "governed store with no consumers yet" line is now WRONG — remove it.

(Flag for a separate plan/§3.1c update: the hard rule needs revising to name the copilot consumer.)

---

## Privacy model (agent-verified — highest confidence)

**Three stale comments CONFIRMED (all contradicted by their own files — trust the code):**
1. `browser-agent-memory.entity.ts:7-12` "ALWAYS strictly private… never sharable" — FALSE; same file
   has `scope` (:20) + `visibility` default PRIVATE (:28).
2. `browser-agent-memory.service.ts:22-24` "ALWAYS user-private… no sharing branch" — FALSE; PLATFORM
   scope is deliberately NOT userId-filtered (:75-88) and `adminListFacts` (:369-437) is a cross-owner
   branch. Also references a non-existent `scope.ts always-private`.
3. `platform.model.ts:136` "(memory stays private)" — stale; the field it annotates
   (`agentSharingUnlocked`) is condition #1 of the sharing gate.
The ACCURATE model is in `shared/lib/browser-agent/memory.ts:4-43` + migration
`3169900000004-MemoryVisibilityAndScopes`.

**SCOPES (`AgentMemoryScope` = USER / PLATFORM / FLOW):**
| Scope | Read/curate filter | Who |
|---|---|---|
| USER | platformId + userId + scope=USER | **owner only** |
| PLATFORM | platformId + scope=PLATFORM (**NOT userId-filtered**) | **every platform member reads AND curates** |
| FLOW | platformId + scope=FLOW + flowId | any member, within one flow |
Acting user always from the principal, never the body.

**VISIBILITY (`MemoryVisibility` = PRIVATE / SHARED):** default PRIVATE; new facts born PRIVATE. **Only
the FACT table carries scope+visibility** — entity/relation graph tables are (platformId, userId)-only
with no cross-owner query (the one place "always private" is accidentally true).

**THE 3-CONDITION CROSS-OWNER GATE** (only `adminListFacts` reads across owners). A USER fact is visible
to an admin only when ALL three hold, ANDed in one WHERE:
`agentSharingUnlocked=true` (admin, from platform_plan) **AND** `agentSharingOptIn=true` (owner, from
user) **AND** `visibility='SHARED'` (owner marked this fact). Org-owned (PLATFORM/FLOW) facts bypass this
(already org-scoped). **Evaluated LIVE via joins** — revoking any switch hides facts on the next read.

**PRIVATE = absolute user veto.** `setVisibility` is owner-only (WHERE bound to acting userId); there is
**no admin write path** to mark another member's fact SHARED, and no admin path to opt a member in. An
admin can only (a) flip the platform unlock and (b) read facts that already satisfy the gate.

**SAFETY:**
- **Secret guard** (`isSecretLike`): refuses (friendly `{saved:false, refused:true}`, not an error) on
  password/api key/secret/token/SSN/credit card/CVV/PIN/private key/seed phrase/mnemonic keywords OR a
  12+ digit run. Applied on remember + updateFact + createFact.
- **Dedupe within target scope ONLY** (distance < 0.08) — a personal fact can never fold into an
  org-visible row (would widen its audience).
- **`forget` (delete) always allowed** (owner-scoped soft delete, recoverable) — never blocked by the
  fact ceiling (only NEW facts are ceiling-gated). But the whole member surface sits behind the
  memory-enabled plan gate (402 if memory not on plan).
- **Recall:** relevance cap distance 0.55; K per tier free=3 / pro=5 / enterprise=8.
- **Graceful degradation:** no pgvector → remember/recall no-op; listFacts still works.
- **Flow principal cannot reach USER memory by construction** — `EngineMemoryScopeEnum` admits only
  PLATFORM/FLOW (a flow has no userId).

## Routes + entitlement + admin governance (agent-verified)

**Canonical routes** (all three prefixes serve the same controllers):
- **`/v1/memory/*`** (member) — `preHandler assertEnabled` on EVERY route (reads included → 402 if off):
  `GET /facts`, `GET /recall`, `POST /facts` (born PRIVATE, gated by `canStoreMoreFacts`),
  `PATCH /facts/:id`, `POST /facts/:id/visibility` (owner's SHARED/PRIVATE veto), `DELETE /facts/:id`,
  `POST /facts/bulk-delete`, `GET /facts/export`, `GET /settings`, `POST /settings`.
- **`/v1/admin/memory/*`** (admin, `platformAdminOnly`) — `GET /` (governance summary), `GET /facts`
  (the gated cross-owner read), `POST /sharing` (flip the platform unlock).
- **`/v1/memory/engine/*`** (flow-step) — `POST /recall`, `POST /remember`. Org/FLOW scope only (no
  userId). **Fails OPEN**: memory off → `200 {facts:[]}` / `{saved:false}`, NOT 402 (never breaks a flow).
- **LEGACY `/v1/browser-agent/memory/*` + `/v1/browser-agent/admin/memory/*`** — retained VERBATIM &
  permanently (the browser extension pins them); **document as deprecated, extension-only**. Prefer
  `/v1/memory/*` everywhere else.

**Entitlement (`memory-plan.service.ts`) — DECOUPLED from the agent:** reads ONLY `platform_plan.memoryCaps`
(its own jsonb column), never `browserAgentEnabled`. `MemoryCaps = {enabled, maxFacts, recallTier,
monthlyOps}`. Fail-closed (missing/malformed/DB-fault → NONE). Off-plan → **402 upsell**
(`FEATURE_DISABLED`). **Reads ARE gated** on the member+admin surfaces (402); the engine surface degrades
to empty instead.

**The four levers:**
1. **`enabled`** — paid door; 402 on every member/admin route incl. reads.
2. **`maxFacts`** — per-user storage cap, enforced on **NEW facts only** (edit/delete never call it, so
   users can always curate). Counts non-deleted facts per (platform, user).
3. **`monthlyOps`** — ⚠️ **DESIGNED-BUT-UNBUILT in the decoupled caps: read by NO enforcement path.** The
   only live monthly memory-op cap is the legacy agent-coupled `agentCaps.monthly.MEMORY_OPS` (pooled per
   platform), which does NOT apply to a Studio-only platform. **Do NOT document a monthly memory-ops
   limit for the decoupled memory product** — it isn't enforced.
4. **`recallTier`** — facts auto-injected: free=3 / pro=5 / enterprise=8. Applied via the engine/auto-
   inject path; the member `GET /recall` uses a plain `limit ?? 5` (does not apply the tier K).

**Tier values (`memory-caps.ts`):** NONE = off/0/0/free · STARTER = on/1,000/2,000/free · PRO =
on/10,000/10,000/pro · TEAM = on/50,000/10,000/pro · ENTERPRISE = on/unlimited/unlimited/enterprise.
(monthlyOps shown for completeness but is inert — see lever 3.)

**Plan → caps:** AGENT_FREE/STUDIO_FREE = NONE; STARTER plans = STARTER; AGENT_PRO = PRO;
**STUDIO_PRO = TEAM (50k)** — ⚠️ open pricing decision (§8a), document shipped behaviour not a settled
tier; TEAM_* / COMPLETE_PRO = TEAM; Enterprise edition = ENTERPRISE.

**Memory sold to Studio-only platforms (no agent): CONFIRMED** — STUDIO_STARTER/STUDIO_PRO/TEAM_STUDIO
all set `memoryCaps` with `browserAgentEnabled:false`. A Studio-only platform can buy + use memory.

**Admin governance — the unlock switch:** `POST /v1/admin/memory/sharing` (`platformAdminOnly`, own
platform only, platformId from principal) flips `platform_plan.agentSharingUnlocked` (condition 1 of the
gate). Because the gate joins the switches LIVE, unlocking makes already-SHARED facts of already-opted-in
members visible on the next read (retroactive, but ONLY facts already meeting opt-in + SHARED); locking
hides them instantly without destroying marks/opt-ins. ⚠️ It's the **shared** `agentSharingUnlocked`
column (same one the agent uses) — flipping it affects both agent and memory governance on that platform.

## Settings + recall + capture + export/GDPR + degradation (agent-verified)

**Consumer boundary — CONFIRMED by the second agent, and STRENGTHENED.** Besides the copilot
(`enterprise/chat/chat-config.service.ts`), the **flow-engine surface `/v1/memory/engine/*` is
purpose-built for flow steps** (recall + remember, org/FLOW scope, writes `MemoryFactSource.AUTO`). The
shared model comments *design* org memory for "flow agent steps / copilot / MCP" (`memory.ts:11-13`).
So live consumers today = **agent runtime, agent tools, Studio copilot, and the flow-engine surface**;
only **MCP** remains unbuilt. Accurate framing:
- ✅ "The agent, the Studio Copilot, and flow steps (via the engine memory surface) can draw on memory."
- ⚠️ BUT nuance for flows: a flow step uses the **engine** surface, which is **org/FLOW scope only —
  never a user's personal USER memory** (an engine principal has no userId; `EngineMemoryScopeEnum` =
  PLATFORM|FLOW). So "flows draw on **org/flow** memory" is now TRUE; "flows draw on your **personal**
  memory" remains FALSE. The copilot (interactive, has a userId) DOES use personal + org.

**SETTINGS (3 per-user toggles on the user row):**
- `autoRecall` — "use my memory to personalise answers." **Default ON.**
- `autoCapture` — "let the agent save facts it learns." **Default ON.**
- `adminVisibilityOptIn` (= `agentSharingOptIn`) — opt in to admin visibility of my SHARED facts.
  **Default OFF.** No admin-facing variant — an admin can NOT opt a member in.

**RECALL:** pgvector cosine similarity over `text-embedding-3-small` embeddings; relevance cap distance
0.55; K by tier free=3 / pro=5 / enterprise=8 (used by agent runtime, copilot, and engine recall). ⚠️
The member `GET /recall` route uses a plain `limit ?? 5`, not the tier K. **No pgvector → graceful
degradation:** recall returns empty (NO keyword/recent fallback — it degrades to "no memory," and the
consumer just answers without personalisation); remember no-ops; **listFacts/exportFacts still work**
(no vector needed).

**CAPTURE (auto-save):**
- Agent tool `remember`: gated by plan → then the user's **`autoCapture` setting** (off → friendly
  "capture turned off", not saved) → then fact ceiling. (Naming flag: records source `EXPLICIT` though
  it's the auto path.)
- Flow-engine remember: org/FLOW scope, `AUTO` source, gated by plan + ceiling, **NOT** by autoCapture
  (no user in an engine principal). Failures swallowed so automation never breaks.
- All writes: secret-guarded, deduped within scope, born PRIVATE.

**EXPORT & DELETE (GDPR):**
- `GET /facts/export` — export a scope's facts as JSON (unpaginated).
- `POST /facts/bulk-delete` — clear a whole scope (soft-delete, operator-recoverable).
- `DELETE /facts/:id` — forget one fact (soft-delete, owner-scoped).
- ⚠️ **GDPR nuance to document carefully:** the agent `forget` **tool** is *guaranteed always allowed*
  ("deleting your own data must never be behind a paywall"). BUT the **REST** delete/bulk-delete/export
  routes all sit behind the memory paid-door `preHandler` → a fully downgraded (memory-off) user **can't
  export or bulk-delete via HTTP** (402). The always-deletable guarantee holds through the agent tool,
  not the REST surface. The per-user **fact ceiling** never blocks curation — only NEW facts are
  ceiling-gated; edit/delete always work once past the paid door.

**SECRET GUARD (verified regex):** `SECRET_HINT` = password/passcode/api key/secret/token/ssn/social
security/credit card/card number/cvv/cvc/pin/private key/seed phrase/mnemonic; `LONG_NUMBER` = 12+ digit
run. Friendly refusal (`{saved:false, refused:true}` + a note), never an error. Applies to the agent
tool, auto-capture, and the manual "Add memory" box alike.

**Flag:** the "1536-dim" figure isn't literal in these files — dimension is enforced against
`BROWSER_AGENT_EMBEDDING_DIMENSIONS`. Documented earlier findings confirm 1536; keep the phrasing
"high-dimensional embeddings" unless citing the config constant directly.

---

## ✅ C4b STATUS — DONE (2026-07-20)
10 pages authored (overview, my-memory, org-memory, flow-memory, privacy-and-sharing, settings,
export-and-delete, safety, admin-governance, plans-and-limits), Memory tab + sidebar wired, build GREEN.
The Agent section's `/memory/*` forward-refs now resolve. Safety-critical claim spot-checked directly:
`setVisibility` UPDATE is owner-bound (`WHERE userId=$ AND scope='USER'`) → PRIVATE veto confirmed, no
admin write path. Only remaining site-wide broken link is the deferred `run-ee`.

⚠️ Follow-ups flagged for the owner (not blocking docs):
- Update plan §3.1c: the "no consumer" hard rule is outdated — copilot + flow-engine surface are built
  consumers (only MCP unbuilt). Docs now say "agent + Copilot + flow (org/flow scope only)."
- `memoryCaps.monthlyOps` is inert (defined, enforced nowhere) — a code cleanup, not a docs issue.
- 3 stale "always private" code comments should be corrected (entity:7-12, service:22-24, model:136).
- GDPR nuance documented: agent `forget` always works; REST export/bulk-delete sit behind the paid door.

## Authoring guidance (net of all 3 agents)
- Trust the code; the 3 "always private" comments are stale.
- Memory = **third product door**, sold to Studio-only platforms (no agent). Framing: *"let your agent,
  your Copilot, and your flows remember."*
- Three scopes: **My memory (USER, private-by-default, owner-only)**, **Org memory (PLATFORM, every
  member reads+curates)**, **Flow memory (FLOW, per-flow, org-wide)**.
- Privacy = the 3-condition gate; PRIVATE is an absolute veto; live revocation.
- Do NOT document `monthlyOps` as an enforced limit (inert). Do NOT claim flows use personal memory.
- GDPR: export + bulk-delete + single forget, soft-delete; note the paid-door nuance.
