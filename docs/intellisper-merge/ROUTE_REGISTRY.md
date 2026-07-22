# Browser Agent — Route Registry (client integration contract)

> The authoritative list of HTTP/SSE routes the Chrome extension and the Intellisper web client
> integrate against. **Updated in the same change as every route added.** All paths are under the
> global prefix **`/api/v1`**. Auth is a blockunits USER JWT (issuer `intellisper`) unless marked
> public. SSE routes stream `data: {json}\n\n` and END after an `action` / `awaiting_confirmation`
> / `awaiting_expansion` event (client resumes via the matching endpoint).
>
> **Protocol version:** clients send `x-intellisper-protocol: <int>` on the chat/handshake path;
> the server serves that version or replies with an `update_required` signal. Event schema is
> **additive-only** (never rename/remove) from v1. Current protocol version: **1**.
>
> Status legend: ✅ implemented & tested · 🟡 in progress · ⬜ planned (phase noted).

---

## Namespacing note
Routes live under **`/api/v1/browser-agent/*`** (NOT `/agent/*`). blockunits already has an
`agentsModule` for its native AI-agent *flow-step* feature; the browser agent is a separate product
and stays namespaced `browser-agent` everywhere. The source product's extension called `/agent/*`;
the extension's base path changes by one config line at cutover (Phase 10).

---

## Health / handshake
| Status | Method | Path | Auth | Request | Response | Phase |
|---|---|---|---|---|---|---|
| ✅ | GET | `/browser-agent/ping` | public | — | `{status:'ok', protocolVersion:number}` | 0 |

## Chat + run lifecycle (SSE) — Phase 4
> Auth: `securityAccess.project([USER], undefined, {BODY projectId})` (project membership; per-user
> ownership enforced in the runtime). All SSE via `reply.hijack()`; header `X-Intellisper-Protocol: 1`.
> Body carries `projectId` (+ `actionId` on run routes). Stream ends after action/awaiting_confirmation.
| Status | Method | Path | Body | Notes |
|---|---|---|---|---|
| 🟡 | POST | `/browser-agent/chat` | `{projectId, message, conversationId?, page?}` | start a turn; SSE; built, tests pending |
| 🟡 | POST | `/browser-agent/runs/:id/observation` | `{projectId, actionId, ok, observation}` | resume after an executed action; SSE |
| 🟡 | POST | `/browser-agent/runs/:id/approve` | `{projectId, actionId}` | approve consequential action; SSE |
| 🟡 | POST | `/browser-agent/runs/:id/reject` | `{projectId, actionId}` | reject; SSE |
| 🟡 | POST | `/browser-agent/runs/:id/expand` | `{projectId}` | research: go deeper (raise cap +4, ≤3×); SSE |
| 🟡 | POST | `/browser-agent/runs/:id/decline-expand` | `{projectId}` | research: compile now (satisfy pending source calls); SSE |

## Conversations — Phase 4
| Status | Method | Path | Auth | projectId source | Notes |
|---|---|---|---|---|---|
| ⬜ | GET | `/browser-agent/conversations` | project([USER], AGENT_READ) | query.projectId | list (paginated) |
| ⬜ | GET | `/browser-agent/conversations/:id/messages` | project([USER], AGENT_READ, TABLE:conversation) | conv | — |
| ⬜ | DELETE | `/browser-agent/conversations/:id` | project([USER], AGENT_WRITE, TABLE:conversation) | conv | soft-delete |

## Memory — Phase 5 (ALWAYS user-private; no admin/sharing path)
> Auth `project([USER], undefined, {QUERY projectId})`. Scoped by (platformId, userId) in the service.
| Status | Method | Path | Query/Params | Notes |
|---|---|---|---|---|
| 🟡 | GET | `/browser-agent/memory/facts` | `?projectId&search?&page?&limit?` | list saved facts (paginated) |
| 🟡 | GET | `/browser-agent/memory/recall` | `?projectId&q&limit?` | semantic recall (cosine top-K) |
| 🟡 | DELETE | `/browser-agent/memory/facts/:id` | `?projectId` | forget (soft-delete) |
| ⬜ | GET/PATCH | `/browser-agent/memory/settings` | — | auto-capture opt-out (Phase 5 follow-up) |
| ⬜ | GET | `/browser-agent/memory/entities` | — | single-hop (deferred) |
> Auto-inject: the runtime recalls top-K relevant facts per turn (wrapped UNTRUSTED_MEMORY). Tools:
> `remember`/`forget` (REVERSIBLE), `recall` (SAFE) — all SERVER, in the tool registry.

## Routines (was "workflows") — Phase 7 ✅
All project-scoped (`securityAccess.project`, BODY for writes / QUERY for reads). Per-user OWNERSHIP
is additionally enforced inside `browserAgentRoutine` via `agentScope` (not a TABLE resource), so a
project member never sees/replays another member's routine. Sharing stays LOCKED until Phase 9.
| Status | Method | Path | Auth | Notes |
|---|---|---|---|---|
| 🟡 | GET | `/browser-agent/routines?projectId&search&page&limit` | project([USER], QUERY) | list → `{routines[],total}` |
| 🟡 | GET | `/browser-agent/routines/:id?projectId` | project([USER], QUERY) | → `{routine, steps[]}` |
| 🟡 | POST | `/browser-agent/routines/from-run/:runId` | project([USER], BODY) | one-click save (auto-name + infer params) → `{routine,stepCount,inferredParams}` |
| 🟡 | POST | `/browser-agent/routines/record/:runId` | project([USER], BODY) | explicit name+params → `{routine,stepCount}` |
| 🟡 | PATCH | `/browser-agent/routines/:id` | project([USER], BODY) | rename/description → `{id,name,version}` |
| 🟡 | PATCH | `/browser-agent/routines/:id/params` | project([USER], BODY) | replace params, version bump → `{id,version}` |
| 🟡 | PATCH | `/browser-agent/routines/:id/steps/order` | project([USER], BODY) | reorder (two-phase txn) → `{ordered}` |
| 🟡 | DELETE | `/browser-agent/routines/:id/steps/:stepId?projectId` | project([USER], QUERY) | ordinal compaction → `{removed}` |
| 🟡 | POST | `/browser-agent/routines/:id/duplicate` | project([USER], BODY) | → `{id,name}` |
| 🟡 | DELETE | `/browser-agent/routines/:id?projectId` | project([USER], QUERY) | soft-delete → `{ok}` |
| 🟡 | GET | `/browser-agent/routines/runs/history?projectId&routineId&limit` | project([USER], QUERY) | replay history → `{runs[]}` |
| 🟡 | POST | `/browser-agent/routines/replay` | project([USER], BODY) | **SSE** deterministic replay; body `{projectId,routine,paramValues?}`; resumes via `/runs/:id/observation` (routed to the replay driver) |
> Agent-facing tools (SERVER): `saveRoutine` (REVERSIBLE — records the current run), `listRoutines`
> (SAFE), `runRoutine` (SAFE — returns the resolved plan as DATA for agent-driven replay). The
> deterministic zero-token path is the `/replay` SSE route above, driven by the runtime, not a tool.
> API tests pending → flips to ✅ when green.

## Files — Phase 6 (edit-track; S3-backed; owner-scoped)
| Status | Method | Path | Body/Query | Notes |
|---|---|---|---|---|
| 🟡 | POST | `/browser-agent/files?projectId` | multipart `file` | → `{fileId,name,mime,editable}`; sha256 dedupe; 20MB; pdf/docx/txt/md |
| 🟡 | GET | `/browser-agent/files/:id/download?projectId` | — | presigned `{url,name}` |
> Tools: `readFile` (SAFE), `editFile` (REVERSIBLE — new version, never destroys original) → `file_ready` event.

## Grammar — Phase 6
| Status | Method | Path | Body | Notes |
|---|---|---|---|---|
| 🟡 | POST | `/browser-agent/grammar` | `{projectId, text}` | plain (NOT SSE); distill + deterministic LCS highlights → `{corrected, edits[], tokensUsed}`. quickTools metering in Phase 9. |

## Automation (batch / schedule / presence / work) — Phase 8 ✅
All project-scoped (`securityAccess.project([USER])`, BODY for writes / QUERY for reads). Per-user
OWNERSHIP enforced in-service via `agentScope`. Prefix `/v1/browser-agent/automation`. Batches/
schedules run on the user's LIVE session — a row waits for the connected extension, never headless.
(Deterministic replay itself is `POST /routines/replay` from Phase 7, not under /automation.)
| Status | Method | Path | Auth | Notes |
|---|---|---|---|---|
| 🟡 | POST | `/browser-agent/automation/batches` | project([USER], BODY) | structured rows → `{id,status,rowsTotal}`; rows sanitised (normaliseRows) |
| 🟡 | POST | `/browser-agent/automation/batches/upload?projectId&routineId&concurrency` | project([USER], QUERY) | CSV/Excel multipart (papaparse+exceljs), formula-injection + proto-pollution hardened, 5MB |
| 🟡 | GET | `/browser-agent/automation/batches?projectId&limit` | project([USER], QUERY) | list → `{batches[]}` |
| 🟡 | GET | `/browser-agent/automation/batches/:id?projectId` | project([USER], QUERY) | → `{batch, rows[]}` |
| 🟡 | POST | `/browser-agent/automation/batches/:id/cancel` | project([USER], BODY) | → `{canceled}` |
| 🟡 | POST | `/browser-agent/automation/batches/:id/retry-failed` | project([USER], BODY) | → `{requeued}` |
| 🟡 | GET | `/browser-agent/automation/batches/:id/export?projectId` | project([USER], QUERY) | aggregated extracted output → `{output[]}` |
| 🟡 | POST | `/browser-agent/automation/schedules` | project([USER], BODY) | cron (`cron-validator`) → `{id,name,enabled}`; each firing spawns a batch |
| 🟡 | GET | `/browser-agent/automation/schedules?projectId` | project([USER], QUERY) | → `{schedules[]}` |
| 🟡 | PATCH | `/browser-agent/automation/schedules/:id/enabled` | project([USER], BODY) | `{enabled}` → registers/deregisters the cron system-job |
| 🟡 | DELETE | `/browser-agent/automation/schedules/:id?projectId` | project([USER], QUERY) | → `{removed}` |
| 🟡 | POST | `/browser-agent/automation/presence/heartbeat` | project([USER], BODY) | Redis TTL presence (HTTP fallback) → `{ok}` |
| 🟡 | GET | `/browser-agent/automation/work/claim?projectId` | project([USER], QUERY) | oldest unattended run's next approved action → `{work}` |
| 🟡 | (WS) | `app.io` USER room = `principal.id` | JWT handshake (existing) | connect→heartbeat, disconnect→clear; server→client `BROWSER_AGENT_WORK_AVAILABLE` nudge (Redis socket adapter → multi-instance) |
> Queue: two `SystemJobName` handlers — `BROWSER_AGENT_SCHEDULE_FIRE` (repeated cron → batch) +
> `BROWSER_AGENT_BATCH_ROW` (one-time admission tick: offline→30s re-defer / concurrency-full→5s /
> else take slot + `startBatchRow` + nudge). Runtime hooks `onBatchRowDone` (atomic counters +
> slot release + finish email) / `onNeedsAttention` (parked consequential → Zoho email) wired in
> app.ts. Email = Zoho Mail via `safeHttp` (`BROWSER_AGENT_ZOHO_MAIL_*` config). API/flow tests
> pending → flips to ✅ when green.

## Sharing switches — Phase 9
| Status | Method | Path | Auth | Notes |
|---|---|---|---|---|
| ⬜ | PATCH | `/browser-agent/sharing` | **platformAdminOnly([USER])** | flips `platform_plan.agentSharingUnlocked` (unlock option only) |
| ⬜ | PATCH | `/browser-agent/sharing/opt-in` | project([USER], AGENT_WRITE) | per-user `user.agentSharingOptIn` |

## Billing (ported alongside platform_plan) — Phase 9
| Status | Method | Path | Auth | Notes |
|---|---|---|---|---|
| ⬜ | GET | `/browser-agent/billing/subscription` | project([USER], AGENT_READ) | current sub |
| ⬜ | GET | `/browser-agent/billing/usage` | project([USER], AGENT_READ) | pooled monthly caps + counts |
| ⬜ | POST | `/browser-agent/billing/subscribe` | project([USER], AGENT_WRITE) | checkout url |
| ⬜ | POST | `/browser-agent/billing/webhooks/:provider` | **public + signature** | paystack/airwallex/paypal |

## Tenancy (Phase 2) — extends existing blockunits auth, NOT new browser-agent routes
The browser agent authenticates via blockunits' EXISTING auth surface (`/api/v1/authentication/*`
+ platform creation). Phase 2 adds product-scope + one-platform-per-email + invite-collision on
those existing routes rather than minting parallel ones:
| Status | Method | Path (existing) | Phase-2 change |
|---|---|---|---|
| 🟡 | POST | `/authentication/sign-up` | accept optional `productScope` (browser\|blockunits\|full) carried to platform creation |
| 🟡 | POST | `/platform` (createPlatformWithProject) | set `platform_plan` product flags; enforce **one platform per email** |
| ⬜ | POST | `/authentication/google` (federated) | **DEFERRED to Phase 10.** blockunits Google is the AUTH-CODE flow (per-platform client). The extension uses IMPLICIT flow (id_token direct) — a NEW id-token verification path against the Intellisper Google client id is needed, but its consumer (the extension) isn't wired to blockunits until cutover. Build with the cutover. |
| 🟡 | POST | `/browser-agent/tenancy/transfer-personal-platform` | invite-collision: transfer/abandon/decline. Body `{action:'transfer'\|'abandon'\|'decline', targetPlatformId?}` → `{action, moved}`. Auth: publicPlatform([USER]). Built; tests pending. |

> Exact request/response DTOs are appended to each row as routes land. Keep this file in lockstep
> with the controllers — a client integrating against it must never hit a 404 or an auth surprise.
