# C4 Agent section — code-grounding (verified, file:line-cited)

Source of truth for authoring the Intellisper Agent docs. Every claim below is traced to
`packages/server/api/src/app/browser-agent/*`. Where the code and a code-comment disagree, the CODE
wins (§3.1c flags stale comments in the memory area especially).

**Module facts (verified directly):**
- Prefix `/v1/browser-agent/*`; registered **CLOUD/ENTERPRISE only** (COMMUNITY never loads it).
- Paid door = `plan.browserAgentEnabled` → 402 upsell when absent.
- `health` + `tenancy` controllers are UNGATED; everything else sits behind the entitlement gate
  (`browser-agent.module.ts:41-57`).

---

## Batch 4 — Files / Grammar / Research / Tool registry (agent-verified)

### Files — `/v1/browser-agent/files`
- **Only two routes**: `POST /` (upload, multipart) and `GET /:id/download` (presigned URL).
  `files/browser-agent-file.controller.ts:30,53`.
- **NO list, NO HTTP delete** — designed-but-unbuilt at the HTTP layer. Deletion exists only as
  soft-delete plumbing (`deletedAt`) + best-effort old-version cleanup on edit. **Docs must NOT claim
  a file list or delete API.**
- Storage: **S3** via `s3Helper`; edit-track only persists (read-track is stateless/inlined).
  Content-hash sha256 dedupe per (user, hash); edits write a new bumped `version`.
- **Max 20 MB** (`MAX_BYTES`, controller:27). Allowed MIMEs (**4**): `application/pdf`,
  docx, `text/plain`, `text/markdown` (controller:21-26).
- **Editable** = text/markdown/docx only (PDF readable but NOT editable). docx text via
  `mammoth`; **PDF text-extraction is nominal** (falls through to raw utf8 — no real PDF parser).
  docx **edits are emitted as `.txt`** (no docx generator). `files/file-format.ts:9-38`.
- `file-audit-usage.entity.ts` actually defines **3 entities**: `AgentFileEntity` (file metadata),
  `AgentAuditLogEntity` (agent event audit trail), `AgentUsageCounterEntity` (monthly usage meter,
  **pooled per platform**, atomic INSERT…ON CONFLICT).

### Grammar — `/v1/browser-agent/grammar`
- One route `POST /` — proofread text, returns `{corrected, edits[], tokensUsed}`. Plain
  request/response (**NOT SSE**), bypasses the agent loop. Metered against **`QUICK_TOOLS`** monthly
  cap before the model call. `grammar/browser-agent-grammar.controller.ts:20-32`.
- Input truncated to 12,000 chars. One model call → JSON `{corrected, edits}` where each edit has type
  `spelling|grammar|punctuation|style`. **Highlight ranges computed deterministically** (token-level
  LCS diff) — the model's offsets are never trusted; it only supplies the type label.
- Model: **`distill` tier = Anthropic `claude-haiku-4-5`** (`model-provider.config.ts:48-49`;
  override `BROWSER_AGENT_DISTILL_MODEL`).

### Research — tools only, NO HTTP route
- `research/web-fetch.service.ts` `fetchAndDistill(url, objective, platformId)`: http/https only,
  **`safeHttp.axios`** (SSRF-guarded, re-checks each of ≤5 redirects), 12 s timeout, 2 MB body cap,
  20 k char text cap, rejects non-HTML/plain. Dependency-free readable-text extraction, then distils to
  ≤1,500 chars via a `distill`-tier call wrapping page content as UNTRUSTED DATA.
- Exposed as agent tools `fetchUrl` + `compileReport` (both SERVER, SAFE). **No research controller.**

### TOOL REGISTRY — **21 tools total** (`tools/tool-registry.ts:14-21`)
Assembled order: pageIntelligence, browserAction, memory, research, file, routine.
Execution site: SERVER (inline in runtime) vs EXTENSION (dispatched to the Chrome extension, pausing
the run). `tools/tool-types.ts:5-9`.

| Category | Count | Site | Tools |
|---|---|---|---|
| Browser-action | 7 | **EXTENSION** | navigate (SAFE), click (REVERSIBLE), type (REVERSIBLE, refuses password/payment), selectOption (REVERSIBLE), scroll (SAFE), screenshot (SAFE), submitForm (**CONSEQUENTIAL**) |
| Page-intelligence | 4 | SERVER | readPage, summarise, answerWithCitations, extractFacts (all SAFE) |
| Memory | 3 | SERVER | remember (REVERSIBLE), recall (SAFE), forget (REVERSIBLE) |
| Routine | 3 | SERVER | saveRoutine (REVERSIBLE), listRoutines (SAFE), runRoutine (SAFE) |
| Research | 2 | SERVER | fetchUrl, compileReport (both SAFE) |
| File | 2 | SERVER | readFile (SAFE), editFile (REVERSIBLE) |

- **EXTENSION-executed = 7** (exactly the browser-action tools). **SERVER-executed = 14.**
- This corrects §3.2's "~20 tools" → **exactly 21**.

**Designed-but-unbuilt / caveats to NOT over-claim:**
- File list + HTTP delete not built.
- PDF: uploadable/readable-nominal, **not editable**, no real PDF parser.
- docx edits degrade to `.txt`.
- Research is tool-only (no HTTP endpoint).

---

## Batch 2 — Routines (record → replay → self-heal) (agent-verified)

Prefix `/v1/browser-agent/routines`. Internally renamed from source "workflow" to avoid colliding
with Studio Flows. A routine is recorded FROM a finished run's executed browser actions (no separate
live DOM recorder).

**Routes** (all plain JSON except replay = SSE):
- `GET /` list · `GET /:id` get+steps
- `POST /from-run/:runId` one-click record (auto-name + infer params) · `POST /record/:runId` explicit record
- `PATCH /:id` rename · `PATCH /:id/params` update params (bumps version) · `PATCH /:id/steps/order` reorder · `DELETE /:id/steps/:stepId` delete step
- `POST /:id/duplicate` · `DELETE /:id` soft-delete
- `GET /runs/history` run history · **`POST /replay` deterministic replay (SSE, the only streaming route)**

**Entities (3):** `browser_agent_routine` (name/description/`params` jsonb/`version` int/`deletedAt`),
`browser_agent_routine_step` (`ordinal`/`action`/**`locators` jsonb**/**`intent` text**/`config`),
`browser_agent_routine_run` (replay history: paramValues/agentRunId/status/progress/timestamps +
batch linkage batchJobId/rowIndex).

**Record:** captures only allowlisted **replayable** actions (navigate/click/type/selectOption/scroll/
submitForm), `status=EXECUTED`, capped at **40 steps**. Server reasoning tools are skipped. Each step
stores multi-signal `locators` (ref, fieldLabel, text, a11y{role,name}, url, value, options) + an NL
`intent`.

**Replay (two paths):**
1. **Deterministic** (`POST /routines/replay`, SSE) — walks steps with **zero model tokens** on the
   happy path; extension resolves each step's locators; pauses for observation, `resumeReplay` advances.
2. **Agent-driven** (`runRoutine` tool) — returns the plan as DATA; the model drives each step.

**Self-heal (runtime, per-run only):** on a failed step — (a) `locator_miss` → bounded **single-step
LLM re-plan** (`selfHealStep`, max 2 attempts, distill→default tier, feeds the step's `intent` + fresh
page elements, asks for one matching `ref`); (b) other failure → bounded plain **retry** (max 2, **never
for a consequential step**); (c) exhaustion → **HALT (pause-for-human), never silent skip**. No
whole-routine re-plan; heals are NOT written back to the saved routine.

**Params:** `RoutineParam[]` (name/label/type/required/options/default). Types = TEXT/EMAIL/NUMBER/DATE/
URL/TEL/SELECT. Auto-inferred at record time (distinct typed/selected values become `{{placeholders}}`).
At replay, `buildReplayPlan` validates required params and substitutes `{{param}}` throughout step args
+ config; missing required → validation error.

**Routine tools (3, all SERVER):** `saveRoutine` (REVERSIBLE), `listRoutines` (SAFE), `runRoutine` (SAFE).

**⚠️ CORRECTIONS to §3.2 — do NOT over-claim:**
- **NO routine version HISTORY.** `version` is a monotonic bump counter (on param edit / reorder /
  step delete); prior step/param snapshots are **not persisted or retrievable**. Docs must not promise
  "version history" — only a change counter.
- **Sharing is LOCKED** — `visibility()` hard-codes `sharingUnlocked:false`; routines are owner-only.
  Do not document routine sharing.
- `RoutineRunStatus` enum defines PENDING/PAUSED but runtime only writes RUNNING→COMPLETED/FAILED.
- condition `onFail:'notify'` currently behaves as `'halt'` (email "Phase 8").

---

## Batch 3 — Automation (batch / schedules / presence) (agent-verified)

Prefix `/v1/browser-agent/automation`. **Cross-cutting model: batches & schedules do NOT run headless —
they run on the user's LIVE browser session via the connected extension; if the extension is offline the
work waits.**

**BATCH routes:** `POST /batches` (JSON rows), `POST /batches/upload` (CSV/Excel multipart),
`GET /batches`, `GET /batches/:id`, `POST /batches/:id/cancel`, `POST /batches/:id/retry-failed`,
`GET /batches/:id/export`.
- **Inputs (3):** structured JSON `rows`; **CSV** (papaparse); **Excel .xlsx** (exceljs — SheetJS
  deliberately avoided). Upload cap **5 MB**. Untrusted-input hardening: **CSV/formula-injection guard**
  (cells starting `= + - @` get a leading apostrophe), prototype-pollution key drop, control-char scrub.
- **Expansion:** one `batch_job` parent + one `routine_run` child per row (status PENDING) + one one-time
  `BROWSER_AGENT_BATCH_ROW` system job per row. `admitBatchRow` gates each row: extension offline →
  re-defer 30 s (give up ~2 h), concurrency full → re-defer 5 s, else run the row's deterministic replay.
- **Caps:** hard ceilings any plan — `MAX_ROWS 10000`, `MAX_COLS 100`, `MAX_CELL_LEN 2000`. Per-plan
  `maxBatchRows` / `maxConcurrentRows` (service defaults 500 / 3; concurrency clamped 1–20). `maxBatchRows=0`
  = batch not on plan → forbidden.
- **Batch statuses:** PENDING, RUNNING, PAUSED_WAITING_EXTENSION, COMPLETED, COMPLETED_WITH_ERRORS,
  CANCELED, FAILED.

**SCHEDULE routes:** `POST /schedules`, `GET /schedules`, `PATCH /schedules/:id/enabled`,
`DELETE /schedules/:id`.
- **Cron-based** via `cron-validator` `{seconds:true, alias:true, allowBlankDay:true}` → accepts **5- or
  6-field** cron + aliases; optional IANA `timezone` (default UTC).
- **Firing:** a per-schedule **REPEATED system job `BROWSER_AGENT_SCHEDULE_FIRE`** (system-jobs BullMQ in
  the API, NOT the worker queue), `{type:'repeated', cron, tz}`. On fire → resolves routine + paramSets
  (default `[{}]` = 1 row) → **spawns a batch** with `scheduleId`.
- `nextRunAt` is **display-only** (BullMQ owns real firing). Cap `maxSchedules` (default 10).

**PRESENCE — ⚠️ NOT co-watching.** It is **extension-online tracking + per-user concurrency bounding**,
NOT a "watch a live agent session together" feature (no such feature exists). Redis TTL presence key
(90 s heartbeat) + atomic in-flight counter (3600 s safety TTL). Socket.IO **userId room**: USER socket
connect → heartbeat, disconnect → clear; a one-way `BROWSER_AGENT_WORK_AVAILABLE` nudge tells the
extension to pull the next action via `GET /work/claim`. HTTP `POST /presence/heartbeat` is a fallback.
**Docs must frame this as "your browser must be connected," not multi-viewer presence.**

**Notifications:** **email only** (no SSE/socket notification). `batchFinished` (honours notify prefs
`onDone`/`onFailed`) + `needsAttention` (when a run parks for approval, if `onNeedsAttention`). Recipient
= explicit `notify.email` or the batch **owner's** email only (tenant-boundary safe). Best-effort.

---

## Batch 1 — Chat + run lifecycle + approvals (agent-verified)

Prefix `/v1/browser-agent`. All chat/run-lifecycle routes **stream SSE** (`AgentEvent`s, with an
`X-Intellisper-Protocol` version header).

**Chat + run-lifecycle routes (SSE):**
- `POST /chat` — start a new turn.
- `POST /runs/:id/observation` — extension POSTs its action result → resume the loop.
- `POST /runs/:id/approve` — approve a consequential action → dispatch to extension (ends stream).
- `POST /runs/:id/reject` — reject → tell the model the user declined, continue.
- `POST /runs/:id/expand` — grant a research-source expansion (go deeper).
- `POST /runs/:id/decline-expand` — decline → compile from gathered sources.

**Conversations (JSON):** `GET /conversations` (list), `GET /conversations/:id/messages`, `DELETE /conversations/:id` (soft-delete).
**Runs — "My Agent" Tier 1 (JSON):** `GET /runs` (list own runs; status/steps/tokens/timing, optional
status filter). **No `GET /runs/:id`, no cancel, no replay route here.**

**Turn loop:** persist USER message → build provider messages (recent history limit 16 + optional page
context + optional UNTRUSTED file context + optional UNTRUSTED auto-recalled memory) → create `AgentRun`
(RUNNING) → yield `meta{conversationId,runId}` → engine loop. Loop bounded by **MAX_STEPS=25** and
**COST_CEILING=200,000 tokens**. One model turn per iteration on a stall-selected tier. Fully
checkpoint-persisted (any replica can resume; no critical state in process memory).

**SSE event types actually emitted (12):** `meta`, `text`, `tool`, `citations`, `action`,
`awaiting_confirmation`, `research_source`, `awaiting_expansion`, `file_ready`, `done`, `halted`,
`error`. ⚠️ **4 declared-but-NEVER-emitted** (do NOT document): `close_tabs`, `budget_exceeded`,
`entitlement_required`, `usage_limit_reached` (budget → `halted{reason:'budget'}`; entitlement → generic
`error`). Stream deliberately ENDS after `action`/`awaiting_confirmation`/`awaiting_expansion`; client
resumes via the observation round-trip.

**APPROVALS — the SAFE / REVERSIBLE / CONSEQUENTIAL model:**
- Each tool declares its own `actionClass`. Browser actions: navigate/scroll/screenshot = **SAFE**;
  click/type/selectOption = **REVERSIBLE**; **submitForm = CONSEQUENTIAL**.
- ⚠️ **ONLY CONSEQUENTIAL gates on human approval.** SAFE and REVERSIBLE extension actions are
  **auto-approved** and dispatched without a gate. (Do not imply every action needs approval.)
- Consequential → persisted `AWAITING_APPROVAL`, engine emits `awaiting_confirmation`, stream ends;
  user hits `/approve` (→ dispatch) or `/reject` (→ model told "user declined, do not retry").
- **Run statuses (6):** PENDING (unused), RUNNING, AWAITING_CONFIRMATION, COMPLETED, HALTED, FAILED.
- **Action statuses (6):** PROPOSED (unused), AWAITING_APPROVAL, APPROVED, REJECTED, EXECUTED, FAILED.

**Server vs extension execution:** SERVER tools carry an `execute` fn, run inline (no pause), feed the
result straight back. EXTENSION tools (the 7 browser actions) persist the intended action and PAUSE; the
external extension performs the DOM op and POSTs to `/runs/:id/observation`. Model calls, tier routing,
server tools, checkpoints, approval-gating, research-budget = SERVER. DOM reads/clicks/typing/nav/
screenshots = EXTERNAL extension.

**Research expansion:** per-run source cap; `/expand` raises it by 4, up to 3 expansions.

---

## Batch 5 — Usage / entitlements / tenancy / monitoring / models (agent-verified)

**The paid door:** `plan.browserAgentEnabled` (module-level `preHandler`). Ungated: health `/ping` +
`tenancy` (the adoption path). Gate throws `FEATURE_DISABLED` → **402**. Access-control failures →
**403**. ⚠️ **A monthly cap hit ALSO surfaces as 402** (`FEATURE_DISABLED`), not 403.

**`agentCaps` per-tier VALUES** (convention: `0` = not included, `-1` = unlimited):

| Caps | ACTIONS | RESEARCH | FILE_OPS | ROUTINE_RUNS | QUICK_TOOLS | MEMORY_OPS | maxBatchRows | maxConcurrent | maxSchedules | reasoning |
|---|---|---|---|---|---|---|---|---|---|---|
| NONE | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✗ |
| FREE | 25 | 3 | 3 | 50 | 20 | 0 | 0 | 0 | 0 | ✗ |
| STARTER | 400 | 40 | 50 | 2000 | 300 | 2000 | 200 | 2 | 5 | ✗ |
| PRO | 3000 | 300 | 500 | 20000 | 3000 | 10000 | 1000 | 3 | 20 | ✓ |
| TEAM | 3000 | 300 | 500 | 20000 | 3000 | 10000 | 1000 | 5 | 40 | ✓ |
| ENTERPRISE | -1 | -1 | -1 | -1 | -1 | -1 | 5000 | 10 | 200 | ✓ |

- `reasoningAllowed` is the ONLY Opus gate (engine returns `reasoning`/Opus only when `stalls>=2 &&
  reasoningAllowed`). Free/Starter never reach Opus.
- **Resolver split:** malformed/absent caps → NONE (fail-CLOSED, deny). DB error → `DEGRADED_CAPS`:
  privileges CLOSED (batch/schedule/reasoning = 0/false) but metric caps set UNLIMITED so a DB blip
  can't hard-deny a paying customer's metered work (fail-OPEN for metering).

**Usage routes (read-only):** `GET /usage` (current-month `{period, metrics:[{metric, used, cap}]}`),
`GET /usage/subscription` (`{plan, status:'active', browserAgentEnabled}` — ⚠️ `status` is HARDCODED
`'active'`, not real). Usage counters are **pooled per platform** (platform×period×metric, atomic
INSERT…ON CONFLICT), refused at cap BEFORE increment.

**Monitoring tiers:**
- **Tier 1 "My Agent"** — `GET /runs`, a user's OWN runs (owner-scoped). Read-only, behind the paid door.
- **Tier 2 "Agent Activity" (tenant-admin oversight)** — `GET /admin/oversight`, aggregates ALL users on
  the caller's OWN platform (totals, active users, token spend, success rate, runs-by-status/day, top
  routines). `platformAdminOnly`, `platformId` from principal. Read-only.
- **Tier 3 operator activity (NO UI)** — `GET /v1/admin/browser-agent/activity`, cross-tenant, gated by
  the OPERATOR KEY header (`api-key`), CLOUD-only, deny-by-default. Explicitly no web UI. **Do not
  document as a user/admin feature** — it's an internal operator surface.

**Tenancy:** `POST /tenancy/transfer-personal-platform` (ungated). Enforces **one browser-agent platform
per email**; seeds the FREE tier on the product door; resolves personal↔team collisions (transfer /
abandon / decline) by re-homing owner-scoped agent tables in one transaction. `agentSharingUnlocked` is
**admin-set, not plan-granted**.

**Models/providers (server-side keys only):** default+distill = Anthropic **claude-haiku-4-5**;
escalation = Anthropic **claude-sonnet-4-6** (on stall); reasoning = Anthropic **claude-opus-4-6**
(Pro+/reasoningAllowed only); fallback = OpenAI **gpt-4o** (cross-vendor, once, on non-credit error);
embeddings = **text-embedding-3-small** (1536-dim). MANAGED mode routes via OpenRouter on platform AI
credits (exhaustion → `AI_CREDIT_LIMIT_EXCEEDED` 402, terminal); ENV mode uses native `BROWSER_AGENT_*`
keys (CE/self-host).
