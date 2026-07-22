# Documentation Page Map — the M1 spec (Option B deliverable)

> **Purpose:** place EVERY page — existing and net-new — into the new IA **before** any scaffolding.
> This is the spec Phase M1 builds `sidebars.ts` from, and the contract that proves nothing is lost.
>
> **Status:** awaiting approval. No files have been created, moved, or edited.
> **`docs/` is retained untouched** for the whole overhaul (owner requirement). The Docusaurus app is
> built in `docs-site/` from a copy; `docs/` is only retired at C6 cutover, after parity is proven.

---

## 1. The "lose nothing" contract (machine-verified)

| Check | Result |
|---|---|
| Pages in `docs.json` nav | **216** |
| Pages placed in the new IA | **216 / 216** (`_map-existing.md`, generated from `_nav-inventory.json`) |
| `.mdx` files on disk | 219 |
| **Orphans** (on disk, hidden from nav) | **3** — decided individually in §3 |
| Broken nav refs (nav → missing file) | **0** |

The existing-page map is **machine-generated** (`rewrite/_map-existing.md`) from the extracted
inventory — not hand-written — so a page cannot be dropped by transcription error. M1 re-runs the
count as a build gate.

---

## 2. New top-level IA (9 tabs)

Grounded in the owner's framing decision: **Intellisper Studio** = umbrella for the flows/runs side;
**Intellisper agent** = the browser side (Routines + other browser features).

| # | Tab | Origin | Notes |
|---|---|---|---|
| 1 | **Overview** | existing (reshaped) | Product front door: *Intellisper = Studio + Agent*. Bento hero (Mockup 1). |
| 2 | **Intellisper Studio** | **new tab, existing content** | Absorbs Overview>Flows (8) + Overview>MCP Server (2). Bridge note: *"Studio in the app = the Build + Operate domains."* |
| 3 | **Intellisper agent** | **NET-NEW** | The browser agent product. CLOUD/ENTERPRISE-only. |
| 4 | **Memory** | **NET-NEW** | Cross-cutting (bridges Studio + Agent). Highest care: personal data + privacy contract. |
| 5 | **Admin Guide** | existing (37) | + net-new admin/observability pages. |
| 6 | **Deploy** | existing (32) | Unchanged shape. |
| 7 | **Embedding** | existing (10) | Unchanged shape. |
| 8 | **Build Blocks** | existing (34) | Unchanged shape. |
| 9 | **API Reference** | existing (55, OpenAPI) | Mockup 3 design (3-col + sticky code rail) + net-new agent/memory API. |
| — | ~~Handbook~~ | existing (34) | **REMOVED from the public site** (owner decision) — internal-facing. See §2b. |

**DECIDED (owner):** Memory = **its own top-level tab** (it spans both products and carries a privacy
contract that needs a findable home).

---

## 2b. Handbook — REMOVED from the public site (owner decision)

**Decision: the Handbook is internal-facing and must NOT ship publicly.** It currently does.

**What's in it (verified, 34 pages):** compensation philosophy + hiring levels, on-call & downtime-
incident procedures, infrastructure / database-migration / security-advisory-response playbooks, and
**3 production postmortems**. Note these are inherited **Activepieces** internal docs — publishing
another company's internal handbook under the Intellisper brand is doubly wrong.

**Mechanism — this matters (verified):**
- ❌ `unlisted: true` is **NOT protection**. It only hides a page from nav/search/sitemap and adds
  `noindex`; **the page still builds and stays publicly reachable by URL.** Wrong tool for
  compensation and postmortems.
- ✅ **`draft: true`** excludes a page from the **production build entirely** (404). This is real removal.

**Chosen approach — belt and braces (all 34 pages):**
1. **Do not register the Handbook tab** in `docs-site` navigation at all (it simply isn't part of the
   public site).
2. Keep the source under `docs-site/` (or `docs/`) but excluded from the production build, so the
   content is **retained, never deleted** (owner's "lose nothing" rule).
3. **Verification gate:** after every build, assert that no `handbook/*` route exists in the output
   (`docusaurus build` + grep the built `build/` dir + sitemap). A page-count check alone would not
   catch a leaked URL.

**Follow-up flagged (not a docs task):** the Handbook is **live publicly right now** on the existing
Mintlify site (`activepieces.com/docs`-derived content under your domain). Removing it from the *new*
site does not un-publish the *current* one — if that content is already exposed under an Intellisper
domain, it should be taken down independently of this migration. **Raising this to the owner.**

**Page accounting:** the 34 Handbook pages are **retained in-repo but not published**, so the public
page total drops from ~254 to **~220**. They still count against "lose nothing" — nothing is deleted.

---

## 3. Orphan pages — explicit decisions (would be silently lost otherwise)

| Orphan (on disk, not in nav) | Decision | Rationale |
|---|---|---|
| `admin-guide/overview` | **Adopt into nav** → Admin Guide > (root) as the tab landing | An Admin Guide landing is needed anyway for the bento design; this file already exists. Verify content first. |
| `build-blocks/misc/create-new-ai-provider` | **Adopt into nav** → Build Blocks > Misc | Real, useful content (referenced by `setup-ai-providers`). Being unlisted looks accidental. |
| `handbook/people/time` | **Moot — not published** (whole Handbook is withdrawn, §2b). Retained in-repo, never deleted. | Internal HR content. Its orphan status is now irrelevant: the entire Handbook is excluded from the public build. |

None are deleted. Each is carried into `docs-site/` regardless; only their *nav visibility* differs.

---

## 4. Existing pages → new IA

Full generated placement: **[`_map-existing.md`](./_map-existing.md)** (216/216).

Summary of moves (everything else keeps its tab and group):

| Old location | New location | Pages |
|---|---|---|
| Overview > Overview | Overview > Start here | 1 |
| **Overview > Flows** | **Intellisper Studio > Flows** | **8** |
| **Overview > MCP Server** | **Intellisper Studio > MCP server** | **2** |
| Overview > About | Overview > About | 3 |
| Admin Guide > * | Admin Guide > * (unchanged) | 37 |
| Deploy > * | Deploy > * (unchanged) | 32 |
| Embedding > * | Embedding > * (unchanged) | 10 |
| Build Blocks > * | Build Blocks > * (unchanged) | 34 |
| API Reference > * | API Reference > * (unchanged) | 55 |
| **Handbook > *** | **NOT PUBLISHED** — retained in-repo, excluded from build (§2b) | **34** |

Only the Overview tab is restructured and the Handbook is withdrawn; the other five public tabs keep
their shape (their *content* is still rebranded + code-traced in C1–C3).

---

## 5. NET-NEW pages

Every page below is grounded in the code map (plan §3.1b/§3.1c/§3.2). Nothing is speculative; anything
unverifiable at authoring time gets a `TODO` marker rather than a guess.

### 5.1 Tab: Intellisper agent (P0 — currently ZERO docs)

| Page | Covers |
|---|---|
| `agent/overview` | What the agent is; Studio vs Agent; **CLOUD/ENTERPRISE-only**; extension-driven model |
| `agent/get-started` | Install the Intellisper extension, sign in, product scope, entitlement |
| `agent/chat-and-runs` | Turn loop (SSE), checkpoints/resume, halts; **SAFE/REVERSIBLE/CONSEQUENTIAL** approvals |
| `agent/routines` | Record → replay → self-heal; params, steps, duplicate, run history |
| `agent/automation` | Batch (structured + CSV/Excel), cron schedules, **live-session** model, presence |
| `agent/files` | Types/limits (pdf/docx/txt/md ≤20MB), read/edit, presigned download |
| `agent/research` | `fetchUrl` + `compileReport` (SSRF-guarded) |
| `agent/grammar` | Grammar quick-tool |
| `agent/monitoring` | **My Agent** (runs) + **Agent Activity** (oversight tiers) in the web app |
| `agent/plans-and-limits` | `browserAgentEnabled`, caps per tier, the 6 usage metrics |
| `agent/api-reference` | `/v1/browser-agent/*` (may fold into the API Reference tab — see §7) |

**Excluded deliberately** (unbuilt — must not be documented): cross-platform sharing endpoints, a
separate agent billing module, Postgres RLS.

### 5.2 Tab: Memory (P0 — highest doc-risk in the repo)

| Page | Covers |
|---|---|
| `memory/overview` | The three scopes; what memory is and is not |
| `memory/my-memory` | `USER` scope — personal, owner-only (the agent's memory) |
| `memory/org-memory` | `PLATFORM` scope — **"everyone in this org can see and curate it"** |
| `memory/flow-memory` | `FLOW` scope — per-flow, reached from the flow |
| `memory/privacy-and-sharing` | **The 3-condition gate**; PRIVATE as absolute veto; live revocation |
| `memory/settings` | auto-recall / auto-capture |
| `memory/export-and-delete` | Export (portability) + bulk delete (GDPR); `forget` is never paywalled |
| `memory/admin-governance` | The **sharing unlock switch** (privacy-critical), governance overview |
| `memory/plans-and-limits` | `MemoryCaps`: **`enabled` / `maxFacts` / `monthlyOps` / `recallTier`** + the verified tier table |
| `memory/safety` | Secret guard; scope-local dedupe; pgvector degradation |

**Updated for release 0.103.0 (re-verified against code):**
- Memory is a **third independent product door** — its own `platform_plan.memoryCaps`, resolved without
  ever consulting `browserAgentEnabled`. **Studio-only platforms can buy and use it, no agent required.**
- Document the canonical routes **`/v1/memory/*`** + **`/v1/admin/memory/*`**. The legacy
  `/v1/browser-agent/memory/*` alias is permanent but deprecated — mention only for the extension.
- Tier table (verified): Free = **off** on both products · Starter 1,000 facts / 2,000 ops · Pro
  10,000 / 10,000 · Team 50,000 / 10,000 · Enterprise unlimited. ⚠️ `STUDIO_PRO` maps to the **TEAM**
  caps (50k) and §8a records an **open pricing decision** — document shipped behaviour, not a settled tier.
- 🚫 **MUST NOT WRITE "your flows draw on org memory."** Verified: **nothing outside `browser-agent/`
  and `app/memory/` imports the memory service** — no flow/copilot/MCP consumer exists. Studio can
  buy/see/add/edit/curate org memory, but **automations do not consult it**. Consumers are
  designed-but-unbuilt.
- Upsell copy is product-neutral: *"…let your agent and your flows remember preferences, projects and
  team knowledge."*

### 5.3 Admin Guide additions (P1 — admins currently fly blind)

| Page | Covers |
|---|---|
| `admin-guide/observability/ai-spend` | AI Gateway + AI spend + usage ledger |
| `admin-guide/observability/agent-activity` | Tenant-admin agent oversight |
| `admin-guide/observability/chat-analytics` | Chat analytics |
| `admin-guide/guides/plans-and-entitlements` | **Every** `platform.plan.*` flag + `agentCaps`; the two conventions (`0` = not included → upgrade; `-1` = unlimited; **fail-closed for privileges, open for metering**) |
| `admin-guide/guides/the-app-ia` | The overhaul UI: Home + Build/Operate/Data/Connect/Insights/Admin (**every existing doc still describes legacy URLs** — this page anchors the C2/C3 trace) |

### 5.4 Studio additions (P2/P3 — shipped features with no page)

| Page | Covers |
|---|---|
| `studio/tables/overview` | **Tables** — first-class surface with **no docs nav entry today** |
| `studio/tables/editor` | Table editor, import/export, records/fields |
| `studio/chat` | Chat / Chat-with-AI (+ compaction, sandbox) |
| `studio/ai-agents` | Flow-step AI agents (`@intelblocks/block-agent`) — distinct from the browser agent |
| `studio/knowledge-base` | Knowledge Base (own vector store) |
| `studio/human-input` | Human input / approvals |
| `studio/alerts` | Alerts |
| `insights/impact` + `insights/leaderboard` | Impact analytics + Leaderboard (**Overview or Studio group — owner call**) |
| `studio/platform-copilot` | Platform Copilot |

### 5.5 API Reference additions — **verified: the spec is ahead of the docs**

Measured: `openapi.json` specifies **65 paths / 25 prefixes**, but the docs nav lists only **16
endpoint groups**. **9 already-specced groups are missing from the docs** — and because Docusaurus
auto-generates from the spec, they appear **for free** once the plugin is pointed at it:

| Missing from docs nav, present in `openapi.json` | Note |
|---|---|
| `/v1/tables` + `/v1/records` | The Tables API — matches the missing Tables feature docs (§5.4) |
| `/v1/knowledge-base` | Matches the missing Knowledge Base docs |
| `/v1/chat` | Matches the missing Chat docs |
| `/v1/project-roles` | Roles/permissions |
| `/v1/mcp-server` + `/v1/mcp-oauth` | MCP (feature is documented; its API is not) |
| `/v1/event-destinations` | Event streaming API |
| `/v1/platforms` | Platform API |

**Agent + Memory API — resolved (was open question #3):** `openapi.json` contains **zero
`browser-agent` refs**. So `/v1/browser-agent/*` (agent + memory, ~30 routes) is **NOT auto-generatable
today**. Two options — owner call:
- **(a) Author manually** in the API Reference tab (Docusaurus supports hand-written API pages). Docs-only
  effort; the spec stays incomplete.
- **(b) Extend `openapi.json`** to cover `/v1/browser-agent/*` (recommended if the product wants a
  complete public spec) — larger, touches the API package, but then the docs generate for free **and**
  the product gains a real spec. Out of docs-scope unless approved.

---

## 6. Page-count summary

| Bucket | Pages | Published? |
|---|---|---|
| Existing (nav), excl. Handbook | 182 | ✅ |
| **Handbook** | **34** | ❌ retained in-repo, excluded from build (§2b) |
| Orphans adopted (`admin-guide/overview`, `create-new-ai-provider`) | 2 | ✅ |
| Orphan `handbook/people/time` | 1 | ❌ (Handbook) |
| Net-new — Agent | ~11 | ✅ |
| Net-new — Memory | ~10 | ✅ |
| Net-new — Admin/observability | ~5 | ✅ |
| Net-new — Studio features | ~9 | ✅ |
| API Reference: 9 specced groups now auto-generated | (free) | ✅ |
| **Total in repo** | **~254** | — |
| **Total published** | **~219** | — |

Nothing is deleted. Net-new authored content ≈ **35 pages** — the largest workstream, batched
per-feature (C4/C4b/C4c).

---

## 7. Decisions — ALL RESOLVED (owner, 2026-07-16)

| # | Question | Decision |
|---|---|---|
| 1 | Memory placement | ✅ **Own top-level tab** |
| 2 | `handbook/people/time` orphan | ✅ **Moot** — whole Handbook unpublished; retained, never deleted |
| 3 | Agent/Memory API (`openapi.json` has **zero** browser-agent refs) | ✅ **Extend `openapi.json`** to cover `/v1/browser-agent/*` — docs then auto-generate and the product gains a complete spec. **Touches the API package → confirm scope before C-phase execution.** Bonus: 9 specced-but-undocumented groups (tables, records, knowledge-base, chat, project-roles, mcp-server, mcp-oauth, event-destinations, platforms) auto-generate **free**. |
| 4 | Impact/Leaderboard placement | ✅ Small **Insights** group |
| 5 | Handbook public? | ✅ **NOT public** — internal-facing; excluded from the production build (§2b). `draft:`-style exclusion, **not** `unlisted` (which stays publicly reachable). |

### ⚠️ Follow-up raised to owner (outside this migration)
The Handbook — **compensation, hiring levels, on-call/incident procedures, infrastructure & security
playbooks, 3 production postmortems** (inherited *Activepieces* internal docs) — **is live publicly on
the current site right now.** Withdrawing it from the new site does **not** un-publish the existing
one. If that content is already exposed under an Intellisper domain, take it down independently of
this migration.
