# Intellisper Documentation Overhaul — Implementation Plan (Docusaurus)

> Status: PLAN (no build/edits yet). Every claim grounded in code/config with references.
> Platform DECIDED: **Docusaurus** (free self-hosting + full custom design matching the attached
> mockups). Supersedes the earlier Mintlify draft of this file. Owner constraints honored: no
> assumptions, confirm from code, phased (not one sweep), accuracy over speed.

---

## 0. Why Docusaurus (decided)

- **Free Mintlify can't deliver the design.** Mintlify's free (Starter) tier **excludes custom CSS/JS
  and white-labeling** — both required for the mockups' curvy/hairline/ambient-shadow look and to drop
  the "Powered by Mintlify" badge. The full design needs Mintlify **Pro (~$250/mo)**. Activepieces
  itself runs a **paid/Enterprise** Mintlify plan (custom domain + white-label + no badge at
  `activepieces.com/docs`, confirmed).
- **Docusaurus = $0 recurring + 100% design control** (React theme + full CSS), at the cost of a
  one-time migration + self-hosting. Owner chose this trade.
- **No collision risk** with Activepieces' Mintlify docs regardless — separate repos/projects. But
  moving to Docusaurus also makes the two visually and structurally distinct, which is the goal.
- **Activepieces official docs** (`activepieces.com/docs`) confirmed = the SAME Mintlify multi-tab
  layout (Overview / Admin Guide / Deploy / Embedding / **Build Pieces** / API Reference / Handbook +
  left sidebar + card welcome) that our copy mirrors. That is exactly the layout we differentiate from.

## 1. Feasibility — Docusaurus meets every requirement (verified)

| Requirement | Docusaurus capability | Verdict |
|---|---|---|
| Multi-tab nav (7 tabs), each with its own grouped sidebar, **never hide content** (req #1) | Navbar `type: "docSidebar"` items, one sidebar per tab; multi-instance docs | ✅ |
| Completely new layout matching mockups (copper/bento/curvy) | Full React theme + Infima CSS vars + custom CSS + swizzled components | ✅ (100%) |
| OpenAPI auto-gen for ~65 endpoints (API Reference tab) | `docusaurus-openapi-docs` plugin (groups by tag, builds sidebar, API playground) | ✅ |
| Search | Algolia DocSearch (free for docs) OR local search plugin (`@easyops-cn/docusaurus-search-local`) — $0 | ✅ |
| The 21 Mintlify MDX component types we use | Admonitions built-in; the rest = ~15 custom React shim components (one-time) | ✅ (migration cost) |
| MDX content | Both are MDX/Git-native; pages port with frontmatter + component-syntax changes | ✅ |
| Versioning/i18n (future) | Built-in | ✅ |

**The migration cost is bounded and known** (see Phase M). Component inventory to convert (measured):
`Steps` 26 files, `Tip` 55, `Warning` 36, `Note` 17, `Info` 13, `Card/CardGroup` 13, `Accordion/
AccordionGroup` 6, `Snippet` 20, `CodeGroup` 1, `Update` 2, plus `Frame`, `ParamField`,
`ResponseField`, `Expandable`, `Tabs/Tab`, `Tooltip`, `RequestExample/ResponseExample`.

## 2. Repo placement & tooling (grounded)

- Monorepo uses **bun** workspaces; `docs/` is currently **bare Mintlify content** (no `package.json`),
  not a workspace member.
- Plan: create a new self-contained Docusaurus app (its own `package.json`, its own deps) at
  **`docs-site/`** (keep the existing `docs/` untouched during migration as the source-of-truth to copy
  from; swap/retire it only after Docusaurus reaches parity). Decide at Phase 0 whether `docs-site/`
  joins the bun workspace or stays standalone (standalone is simpler; Docusaurus has its own build).
- Hosting (free): GitHub Pages, Cloudflare Pages, or Vercel — all $0 for a static Docusaurus build.
  Custom domain (e.g. `docs.intellisper.*`) is free on all three. Chosen in Phase 0.

---

## 3. Grounded product facts this plan builds on (unchanged by platform)

These were confirmed by code audits and carry over verbatim from the grounding pass. Full detail in
memory `docs-overhaul-grounding.md`; summary:

### 3.1 Product framing (owner decision)
- Docs introduce **"Intellisper Studio"** = umbrella for the **flows/runs** side only, and
  **"Intellisper agent"** = the **browser side** (Routines + other browser features).
- "Intellisper Studio" is NOT yet a shipped UI name (only in a pricing proposal + `STUDIO_*` plan
  constants; app scope value is `BLOCKUNITS`). App vocabulary = Flows/Runs under Build/Operate domains.
  A "Studio in the app = Build + Operate" bridge note keeps docs↔UI aligned.

### 3.1b THE BIGGEST GAP — the docs document almost NONE of Intellisper's own features (verified)

The docs are a stale Activepieces fork. An independent grep of the 216 nav pages found **zero
dedicated pages** for the platform's major features. Measured:

| Feature | Code location | Dedicated docs pages | Status |
|---|---|---|---|
| **Memory** (USER/PLATFORM/FLOW scopes) | `browser-agent/memory/*`, `/operate/memory`, admin memory | **0** | **MISSING** |
| **Browser agent / Routines** | `browser-agent/*` | **0** (zero mentions) | **MISSING** |
| **Tables** | `app/tables/*`, `/data/tables/:id` editor, MCP table tools | **0** | **MISSING** |
| **Chat / AI chat** | `app/chat/*`, `/chat` | **0** (zero mentions) | **MISSING** |
| **Knowledge base** | `app/knowledge-base/*` | **0** (zero mentions) | **MISSING** |
| **Flow-step AI agents** | `app/agents/*`, `@intelblocks/block-agent` | **0** (zero mentions) | **MISSING** |
| **Impact / Leaderboard analytics** | `app/analytics/*`, `/insights/*` | **0** | **MISSING** |
| **Alerts** | `.agents/features/alerts.md` | **0** | **MISSING** |
| **AI gateway / AI spend** | `app/ai-gateway/*`, `/admin/observability/ai-spend` | **0** | **MISSING** |
| **Platform copilot** | `.agents/features/platform-copilot.md` | **0** | **MISSING** |
| **Human input / approvals** | `.agents/features/human-input.md` | **0** | **MISSING** |

Verification notes: the 17 `.mdx` files matching "memory" are ALL noise (`IB_SANDBOX_MEMORY_LIMIT`,
in-memory queue, memory locks). Searching the real feature vocabulary (`org memory`, `agent memory`,
`memory fact`, `recall`) returns **zero files**. `Tables` — a first-class Data-domain surface with an
editor and MCP tools — has **no nav page at all**.

**Consequence for this plan:** the overhaul is not "rebrand + restyle + add an agent section." It must
also **author net-new documentation for every shipped-but-undocumented feature** (Phase C4b). This is
the largest content workstream and is sized after the feature-coverage matrix lands.

### 3.1c MEMORY — first-class, cross-product, and the highest doc-risk item in the repo

> ⚠️ **Three code comments are STALE and contradict their own code.** They still assert memory is
> "ALWAYS private / never sharable": `browser-agent-memory.entity.ts:8-9`,
> `browser-agent-memory.service.ts:24-26`, `platform.model.ts:135`. The same files declare the
> `visibility`/`scope` columns and `adminListFacts`. **Trust the code, not the comments.** (Flag these
> for a separate code-comment fix — out of scope for docs, but they will mislead the next reader.)

- **Scopes** (`AgentMemoryScope`, migration `3169900000004-MemoryVisibilityAndScopes`):
  - **`USER`** — "My memory": owner-only. The **agent's** personal memory.
  - **`PLATFORM`** — "Org memory": **every platform member can read AND curate** (deliberately NOT
    filtered by userId). Framed as **Studio's** shared team knowledge.
  - **`FLOW`** — per-flow memory, org-wide within one flow; reached from the flow, not the memory page.
  - `MemoryVisibility` = `PRIVATE | SHARED`. Only **facts** carry scope/visibility (entity/relation
    tables do not).
- **The only cross-owner read = a 3-condition gate (ALL required):** `agentSharingUnlocked` (admin
  unlocks) AND `user.agentSharingOptIn` (owner opts in) AND `fact.visibility='SHARED'` (owner marks the
  fact). Joined live, so revoking hides on the next read. `PRIVATE` = absolute user veto; **an admin
  cannot mark a member's fact shared.**
- **Four distinct levers** (docs must not conflate): `memoryEnabled` (paid door → **402 on every memory
  route, reads included**) / `maxFacts` (per-user storage cap, enforced on **new facts only** so users
  can always curate/delete) / `MEMORY_OPS` (monthly flow rate, pooled per platform) / `recallTier`
  (facts injected: free=3, pro=5, enterprise=8).
- **Tiers:** NONE + **Free = memoryEnabled FALSE** ("capable but forgetful"); Starter = 1k facts / 2k
  ops / free recall; Pro = 10k / 10k / pro; Team = 50k / 10k / pro; Enterprise = unlimited. **Memory is
  the entry paid tier's headline feature.**
- ✅ **RESOLVED in release 0.103.0 — memory is now a THIRD independent product door.** (The former
  coupling defect is fixed; [`memory-studio-gap.md`](./memory-studio-gap.md) is retained as the record
  of *why* the architecture changed.) Re-verified against code before writing any memory docs:
  - **Entitlement decoupled:** its own `platform_plan.memoryCaps` (`MemoryCaps` =
    `enabled`/`maxFacts`/`recallTier`/`monthlyOps`). Resolver `app/memory/memory-plan.service.ts`
    reads ONLY that column and never consults `browserAgentEnabled`.
  - **Routes decoupled:** canonical **`/v1/memory/*`** + **`/v1/admin/memory/*`** — **document these**.
    The legacy `/v1/browser-agent/memory/*` alias is retained **permanently** (the browser extension is
    an external client that cannot be force-upgraded) — mention it only when documenting the extension.
    Not on plan → **402 with an upgrade prompt** (an upsell, not an error state).
  - **Sold to Studio:** `STUDIO_STARTER` → `MEMORY_CAPS_STARTER`, `STUDIO_PRO` → `MEMORY_CAPS_TEAM`,
    `TEAM_STUDIO` → `MEMORY_CAPS_TEAM` — all with **no `browserAgentEnabled`**. Verified.
  - **Verified tier numbers** (from `MEMORY_CAPS_*`): NONE = off/0 · STARTER = 1,000 facts / 2,000 ops /
    free recall · PRO = 10,000 / 10,000 / pro · TEAM = 50,000 / 10,000 / pro · ENTERPRISE =
    unlimited / unlimited / enterprise. **All Free tiers = memory OFF** (the deliberate upgrade seam:
    agent and flows work, but start every task fresh).
  - ⚠️ **`STUDIO_PRO` maps to `MEMORY_CAPS_TEAM` (50k), not `MEMORY_CAPS_PRO` (10k)** — confirmed in
    code, but §8a of `SUBSCRIPTION_PLANS_PROPOSAL.md` records an **open pricing decision** on Studio
    Pro's budget. Document the shipped behaviour; do **not** present that tier as settled.
- 🚫 **HARD RULE for C4b — do NOT write "your flows draw on org memory."** Verified by grep: **no code
  outside `browser-agent/` and `app/memory/` imports the memory service.** No flow step, copilot or MCP
  surface reads or writes it. Studio customers can **buy, see, add, edit and curate** org memory via UI
  and API, but **automations do not consult it** — it is a governed store with no consumers yet. That
  work is designed-but-unbuilt. Writing otherwise documents an aspiration as shipped.
- **Copy framing:** the old agent-only upsell is gone. Use the product-neutral line — *"…let your agent
  and your flows remember preferences, projects and team knowledge."*
- Safety details worth documenting: secret guard (passwords/keys/SSN/card/12+ digit runs → friendly
  `refused`), dedupe **within target scope only** (cross-scope dedupe would leak personal → org),
  `forget` deliberately **not** plan-gated, graceful degradation without pgvector, export/GDPR delete.
- **Docs implication:** Memory **bridges Studio and Agent** → its own cross-cutting section referenced
  from both, NOT a footnote in the agent section. Highest care: it stores personal data and carries a
  privacy contract.

### 3.2 Browser agent / Routines (net-new section — capture everything, req #2)
Server `packages/server/api/src/app/browser-agent/*` (CLOUD+ENTERPRISE only; distinct from flow-step AI
agents). Capabilities: chat+run lifecycle (SSE, approvals SAFE/REVERSIBLE/CONSEQUENTIAL), conversations,
memory (pgvector 1536-dim, **always private**), **Routines** (record→replay→self-heal, params/steps/
duplicate/history), **automation** (batch structured+CSV/Excel, cron schedules, live-session presence),
files (S3 ≤20MB), grammar, research, usage/subscription, runs list (Tier1) + oversight (Tier2) +
operator activity (Tier3 no-UI). ~20 tools (browser actions extension-executed; rest server). 15
entities; API `/v1/browser-agent/*`. Gates: `browserAgentEnabled` + `agentCaps` + `agentSharingUnlocked`;
tiers FREE/STARTER/PRO/TEAM/ENTERPRISE.
- **HARD constraints:** the **extension is external** (not in repo) — web app only monitors (My Agent
  runs + Agent Activity oversight); all actions happen in the extension. **Do NOT document** sharing/
  billing-module/RLS (unbuilt). Names: Routines, Agent Routines, My Agent, Agent Activity.

### 3.3 Flows/Runs/MCP + drift (req #5)
- `FlowActionType = CODE | BLOCK | LOOP_ON_ITEMS | ROUTER` (**BLOCK, not PIECE**). `FlowRunStatus` = **11
  states**. retry/bulkRetry/cancel confirmed. MCP real (~45 `ib_*` tools, OAuth).
- **Confirmed doc defects to fix:** `mcp/tools.mdx` `PIECE/PIECE_ACTION/PIECE_TRIGGER` → `BLOCK`;
  `flows/debugging-runs.mdx:9` "Dashboard→Runs" → Operate/Runs; recheck every hardcoded limit/env var.

> 🐛 **Rebrand leak found in SOURCE (Phase 0, incidental):** `packages/server/api/src/app/app.ts:131`
> hardcodes the OpenAPI production server as **`https://cloud.activepieces.com/api`**. This is live
> code, not docs — every generated spec (and any client built from it) carries the wrong brand/host.
> Same class as the migration bug noted in the task brief. Should be fixed in the API package as part
> of the spec work above (or on its own); flagged here so it is not lost. Docs' own copy of the URL is
> handled by C1.

### 3.4 Rebrand scope (req #4)
145 `activepieces` refs (URLs/emails/CDN/embed-SDK), docs.json externals + openapi server URL, 5
`@activepieces.com` emails, ~104 stale UI screenshots, 21 branded asset filenames. (Note: `mint.json`/
`docs.json` config is replaced by Docusaurus config, so those specific brand links move into
`docusaurus.config.js`.)

### 3.5 Design system (from mockups + app brand)
Copper primary `#B5652F`/`#C4703A` (mockups use `#973415`), Kurvant blue `#3B6EF5` + violet `#9B7FE0`,
yellow `#F5B818`; Playfair Display (headings) + Hanken Grotesk (body) + JetBrains Mono (code); curvy
~12px cards, hairline borders, ambient copper shadows, glint hover, left-border callouts, bento hero
grids, subtle radial/gradient background. Light-gray light ground / near-black dark ground. Now fully
achievable (custom React theme + CSS).

**Three mockups received. Shared language:** Playfair Display + Hanken Grotesk + JetBrains Mono; copper
family primary; hairline (0.5px) borders; rounded/curvy surfaces; ambient/glow hover; editorial feel.
Mockup 1 (Overview) + Mockup 2 (API Endpoints, light) + **Mockup 3 (API Reference, dark)**.

### 3.5b API Reference design (Mockup 3) — the three-column pattern

Distinct tokens (deeper, darker variant of the same family — reconcile into one token set at M5):
- **Dark-first**: bg `#1b1c1c`; primary oxblood `#6b0d09`, `primary-container #8b261d`,
  `primary-fixed-dim #ffb4a9`; secondary amber `#8c4f10`/`#fdad67`, `secondary-fixed #ffdcc2`.
- **Glass panels**: `rgba(48,48,48,.4)` + `backdrop-blur(12px)` + 0.5px copper-tinted border;
  **copper glow on hover** (`0 0 15px rgba(184,115,51,.15)`); 4px copper scrollbar.
- **Asymmetric 3-column**: floating rounded glass sidebar (`w-72`, inset `left-4`) → content
  (`ml-80 mr-[35%]`) → **fixed sticky right code rail (`w-[35%]`)**.
- **Endpoint header**: method pill (`POST`) + mono path; **4-col parameter grid rows**
  (name + `Required` badge | description + type hint).
- **Code rail**: language tabs (cURL / Node.js / Python), copy button, macOS traffic-light chrome,
  custom syntax palette (`string #fdad67`, `key #ffb4a9`, `keyword #b87333`, `comment #8b716e`),
  plus an **inset response-example preview** below.
- Response schema block with status chip (`201 Created`).

**Feasibility (verified):** `docusaurus-openapi-docs` natively renders an **API Explorer / demo panel**
with code samples (`x-codeSamples`), language tabs, method badges, param tables and response schema,
and exposes a **swizzleable `@theme/ApiItem`** + per-language CSS classes
(`.openapi-tabs__code-item--python`, …) on Infima. So the mockup is achieved by **restyling + a
targeted `ApiItem` swizzle**, NOT by building an API renderer. The 3-column geometry is CSS/layout work
on the plugin's existing structure.
**Risk:** the plugin's default column geometry may differ from the mockup's `w-72 / ml-80 / 35%` split;
if the swizzle proves invasive, fall back to styling within the plugin's own layout (keeps upgrade
safety). Decide in M4/M5 after seeing the rendered default.

---

## 4. Phased execution

> Two stages: **M = Migration/build** (stand up Docusaurus at parity), then **C = Content** (rebrand,
> code-trace, agent section, images). Each phase is a reviewable batch with explicit verification.
> No phase starts until the prior verifies. The existing `docs/` stays intact until parity (req #1
> safety: nothing is lost).

### Phase 0 — Scaffold & decisions (blocking)
- `npx create-docusaurus@latest docs-site classic --typescript`. Pick hosting (GH/Cloudflare/Vercel
  Pages) + free search (Algolia DocSearch vs local plugin). Decide workspace vs standalone.
- Add plugins: `docusaurus-openapi-docs` + `docusaurus-theme-openapi-docs`, search plugin.
- Deliverable: empty Docusaurus site builds & serves locally. **No content yet.**

### Phase M1 — Navigation skeleton (7 tabs, zero content loss)

> **Baseline inventory (measured, machine-extracted — the "lose nothing" contract):**
> - **216 pages in `docs.json` nav**: Overview 14, Admin Guide 37, Deploy 32, Embedding 10,
>   Build Blocks 34, API Reference 55, Handbook 34. Full list: `docs/rewrite/_nav-inventory.json`.
> - **219 `.mdx` on disk** → **3 ORPHAN pages hidden from nav** that a naive port would silently drop:
>   `admin-guide/overview`, `build-blocks/misc/create-new-ai-provider`, `handbook/people/time`.
>   Each gets an explicit decision in the page map (adopt into nav / keep hidden / retire) — never
>   dropped by accident.
> - **0 broken nav refs** (every nav entry has a file).
> - **`docs/` is RETAINED untouched** for the entire overhaul (owner requirement). Docusaurus builds in
>   `docs-site/` from a copy; `docs/` is only retired at C6 cutover, and only after parity is proven.
> - **Option B deliverable:** a page-level sidebar map placing all 216 + the 3 orphans + every NEW
>   feature page is produced and approved BEFORE any scaffolding. It is the M1 spec.
- Recreate the **exact 7-tab structure** as 7 docSidebar navbar items, each with its grouped sidebar
  mirroring today's `docs.json` groups (Overview, Admin Guide, Deploy, Embedding, Build Blocks, API
  Reference, Handbook) — PLUS the two new product landings (Studio, Agent) per §3.1.
- Port `sidebars.ts` from the current `docs.json` navigation tree (1:1 page mapping).
**Verify:** page-set diff — every one of the current pages has a sidebar slot (count must match +
new pages). This is the req #1 "never hide content" gate, enforced mechanically.

### Phase M2 — Component shims (the migration core)
- Build ~15 React components under `docs-site/src/components/` matching the Mintlify API so migrated
  MDX "just works": `Card`, `CardGroup`/`Columns`, `Steps`/`Step`, `Frame`, `Accordion`/
  `AccordionGroup`, `Tabs`/`Tab` (or use Docusaurus native Tabs), `ParamField`, `ResponseField`,
  `Expandable`, `Tooltip`, `Update`, `RequestExample`/`ResponseExample`, `Snippet` import shim.
- Map callouts `<Note>/<Tip>/<Warning>/<Info>/<Check>` → Docusaurus admonitions (`:::note` etc.) via a
  transform (or keep as shim components for minimal diff — decide by which yields cleaner MDX).
- Register components globally (MDXProvider / `theme/MDXComponents`) so pages need no per-file imports.
**Verify:** a representative page using each component type renders correctly.

### Phase M3 — Content port (scripted + verified)
- Copy `docs/**/*.mdx` → `docs-site/docs/**`. Run a migration script (adapt the existing
  `docs/rewrite/md-to-doc.cjs` groundwork) to adjust frontmatter (Mintlify→Docusaurus keys) and any
  MDX syntax deltas (e.g. self-closing tags, `className`, expression escaping that MDX v3 is strict on).
- `_snippets/*` → shim imports. `/resources/*` images copied to `static/`.
**Verify:** `docusaurus build` passes with **zero MDX compile errors** (MDX v3 is strict — this is the
main migration risk; budget iteration here). Broken-link check clean. Spot-render 10 varied pages.

> 🚨🚨 **ESCALATED (Phase 0, owner chose "fix at source"): `docs/openapi.json` IS A STALE, INHERITED
> ARTIFACT — it does not describe this codebase.** Fixing at source is therefore NOT a 26-summary job.
> Evidence (all measured):
> - The file was committed once, in the **initial Activepieces import** (`676b80e9`, 2026-07-11) and
>   **never regenerated**. It is a snapshot, not build output.
> - Swagger runs with **`hideUntagged: true`** (`app.ts:123`), so an operation without `tags:` in its
>   route schema **cannot** appear in a freshly-generated spec.
> - Yet the snapshot tags `GET /v1/projects` as `"projects"`, while
>   `enterprise/projects/platform-project-module.ts` has **0 `tags:` and 0 `description:`**. Same for
>   `global-connection-module.ts` and `chat.module.ts`.
> - **5 of the 9 tag groups behind the 26 text-less operations — `projects`, `project-members`,
>   `global-connections`, `chat`, `project-releases` — do not exist anywhere in the API source.**
>   Only `sample-data`, `mcp-oauth`, `user-invitations`, `worker-machines` are real.
> **What this means:** the docs' API Reference (55 pages) currently describes an inherited Activepieces
> API surface, partly untethered from what Intellisper actually serves. Regenerating the spec honestly
> would likely *remove* endpoints the docs claim exist, and require adding `tags`+`summary` to the real
> controllers to bring them back. That is API-package work with product implications — **NOT** a docs
> migration task, and far beyond "add 26 summaries".
> **Recommendation:** treat "regenerate + tag the real API" as its own scoped task with the owner
> (it is the same class of work as the approved `/v1/browser-agent/*` spec extension). Until then, M4
> is **blocked**; M1–M3 (nav, shims, content port) proceed unaffected.
>
> ---
> **Original finding (superseded by the above, kept for the measurement):**
> 🚨 **M4 BLOCKER FOUND IN PHASE 0 (measured, not assumed).** `docusaurus-plugin-openapi-docs@5.1.2`
> requires every operation to declare `summary` **or** `operationId`. Against `docs/openapi.json`:
> **93 operations · 1 has a summary · 0 have an operationId · 92 cannot generate.** A trial run
> produced **1 of 65** endpoint pages.
> **Root cause:** the spec is generated by `@fastify/swagger` from route schemas, which emit the human
> text as **`description`** (e.g. `"List flows"`), not `summary`. Mintlify tolerates a missing
> `summary`; this plugin does not. The data mostly exists — it is in the wrong field.
> **Coverage of the fallback:** **67 of 93** operations have a `description`; **26 have neither**
> (e.g. `GET /v1/sample-data`, `POST /v1/mcp-oauth/approve`, `GET /v1/user-invitations`,
> `GET /v1/worker-machines/queue-metrics`).
> **Options (owner decision — do NOT guess):**
> (a) **Fix at source (recommended):** add `summary` to the Fastify route schemas so the generated spec
>     carries it. Benefits the product's real spec, not just the docs. Touches the API package →
>     needs the same approval as the agreed `/v1/browser-agent/*` spec extension.
> (b) **Build-time shim:** derive `summary` from `description` when absent during generation. Fixes 67
>     mechanically; the 26 with no text still need human summaries (or fall back to `METHOD /path`).
> (c) Hand-author the API tab — rejected: loses auto-generation, the reason we kept a spec.
> Either way the **26 text-less operations need a human sentence** — that is authoring, not migration.

### Phase M4 — OpenAPI reference (65 endpoints)
- Point `docusaurus-openapi-docs` at `openapi.json`; generate the API Reference tab (grouped by tag to
  match today's 16 endpoint groups). Wire the API Explorer / demo panel.
- **Inspect the plugin's DEFAULT rendered layout first** and record how far it already is from Mockup 3
  (§3.5b). That observation decides M5b's approach (CSS-only vs `ApiItem` swizzle) — do not assume.
- Populate `x-codeSamples` (cURL / Node.js / Python) so the code rail has the mockup's language tabs.
**Verify:** all ~65 endpoints render with params/responses; sidebar matches the current API groups;
default layout captured for comparison.

### Phase M5 — Custom theme (Mockups 1 & 2 — the docs shell)
- Reconcile the three mockups into ONE token set (they share Playfair/Hanken/JetBrains + a copper
  family; Mockup 3 is the darker/deeper variant — resolve primary, surfaces, and glass treatment once,
  then apply everywhere). Reconcile against the app brand (copper `#B5652F` + Kurvant blue/violet/yellow).
- Infima CSS variables + custom CSS + minimal swizzles (`Navbar`/`Sidebar`/`DocItem`): curvy cards,
  hairline borders, ambient shadows, glint hover, background decoration, light/dark.
- Rebuild landings (Overview front door, Studio, Agent, per-tab) as bento Card/Column grids.
**Verify:** visual pass (light+dark, mobile+desktop) vs Mockups 1–2; a11y contrast; **content never
clipped/hidden** (req #1).

### Phase M5b — API Reference design (Mockup 3 — the three-column pattern) — ✅ DONE (2026-07-18)
- Apply §3.5b to the plugin's output: glass sidebar, method pills, 4-col param grid, response-status
  chips, and the **sticky right code rail** (language tabs + copy + traffic-light chrome + syntax
  palette + inset response preview).
- Prefer **CSS/Infima-variable styling**; swizzle `@theme/ApiItem` only if the 3-column geometry demands
  it (keep swizzles minimal for upgrade safety — see risk register).

**RESOLVED — NO swizzle needed.** Inspecting the plugin's real DOM (`node_modules/.../ApiItem/index.js`)
showed it ALREADY renders the mockup's geometry: `col--7 openapi-left-panel__container` (MDX content) +
`col--5 openapi-right-panel__container` (the ApiExplorer: security → language-tabbed code samples →
interactive request → response). With the Docusaurus sidebar that is exactly sidebar | content | code
rail. So M5b is **pure CSS** on real, stable selectors (added to `src/css/custom.css`, §"M5b"):
- endpoint header = glass panel + method-colored `.badge` pill + mono path;
- `.openapi-right-panel__container` made **sticky** (releases to inline flow < 996px — req #1);
- param/schema rows hairline-separated, `Required` rendered as a chip;
- response-code tabs → pill chips; code blocks get the copper glow;
- **sidebar method pills**: the plugin tags the `<li>` (`menu__list-item ... post api-method`), so the
  pill hangs off `.menu__list-item.<method> > .menu__link::before` (GET/POST/PUT/PATCH/DEL, brand-colored).
- Tokens are M5's reconciled copper family (dark ground `#1b1c1c`); §3.5b's divergent oxblood was NOT
  re-introduced (docs match the product).

**Verified:** built green (only the deferred `run-ee` link warns); Playwright screenshots at 1440px
(dark + light) and 900px (tablet) confirm the 3-column render, the method pills, the sticky glass rail,
and graceful collapse with **no content hidden/clipped**.

> **Parity gate:** at end of M5, Docusaurus renders 100% of current content + new landings, with
> OpenAPI + search + the new design. Only now does content work begin; `docs/` can be retired after C.

### Phase C1 — Rebrand batch (req #4)
Remap the 145 `activepieces` refs by category (app/marketing/CDN/community/demo URLs, 5 emails), move
docs.json external links into `docusaurus.config.js` (GitHub→Kurvant/Intellisper, footer socials, logo
href, "Get Started"), fix openapi server URL, finish residual "piece(s)"→"block(s)" (except real code
enums). **Open item:** collect the canonical Intellisper URLs from code/config and confirm with owner
before applying — never invent them.
**Verify:** broken-links clean; grep shows zero in-scope `activepieces` residue; each remapped URL
resolves.

### Phase C2 — Studio content code-trace (req #5, high care)
Per-page trace vs code: `mcp/tools.mdx` `PIECE*`→`BLOCK` + verify every tool vs `mcp/tools/*`;
`flows/debugging-runs.mdx` nav; flows terminology/versioning; runs = 11 `FlowRunStatus` states;
re-verify every hardcoded limit/env var in `flows/known-limits.mdx` + `install/configuration/*`.
Unverifiable claims get a `{/* TODO: verify */}`, never a guess.
**Verify:** adversarial second code-trace on changed pages; build passes.

### Phase C3 — Remaining tabs code-trace + rebrand finish (req #5)
Same discipline for Admin Guide / Deploy / Embedding / Build Blocks / API overview / Handbook. Confirm
enum/flag/env/permission claims vs code.
**Verify:** code re-trace on changed pages; build + broken-links.

### Phase C4 — NET-NEW Intellisper agent section (hard req #2)
New tab "Intellisper agent" with pages grounded in §3.2: Overview (CLOUD/ENTERPRISE-only), Get started
(install the extension), Chat & runs (turn loop + SAFE/REVERSIBLE/CONSEQUENTIAL approvals), Routines
(record→replay→self-heal), Automation (batch/schedules/live-session), Files, Research, Grammar & quick
tools, Monitoring in the web app (My Agent + Agent Activity tiers), Plans & limits, API reference
(`/v1/browser-agent/*`). Exclude unbuilt sharing-endpoints/billing-module/RLS. (Memory is C4b.)
**Verify:** page list cross-checked against the §3.2 capability inventory (nothing dropped); code-trace
each page vs `browser-agent/*`; build passes.

### Phase C4b — NET-NEW **Memory** section (highest care — personal data + privacy contract)
Cross-cutting section (referenced from both Studio and Agent) per §3.1c: Overview (the three scopes),
My memory (personal), Org memory (shared team knowledge — *"everyone in this org can see and curate
it"*), Flow memory, Privacy & sharing (**the 3-condition gate**, PRIVATE as absolute veto, live
revocation), Settings (auto-recall/auto-capture), Export & delete (GDPR), Admin governance (the sharing
**unlock switch** — an admin flipping this blind is a privacy incident), Plans & limits (`MemoryCaps`:
enabled/maxFacts/monthlyOps/recallTier + tier table), Safety (secret guard, scope-local dedupe).

Document **what ships** (post-0.103.0 — re-verified):
- Memory is a **third independent product door**: **Studio-only platforms can buy and use it, with no
  agent**. Canonical routes `/v1/memory/*` + `/v1/admin/memory/*`; the `/v1/browser-agent/memory/*`
  alias is permanent-but-deprecated (extension only). Not-on-plan → 402 upsell, not an error.
- 🚫 **Do NOT write "your flows draw on org memory."** Verified: nothing outside `browser-agent/` and
  `app/memory/` imports the memory service — Studio can buy/see/add/edit/curate org memory, but **no
  flow, copilot or MCP surface consults it**. Consumers are designed-but-unbuilt.
- Free = memory **off** on both products (the deliberate upgrade seam). ⚠️ `STUDIO_PRO` → TEAM caps
  (50k) with an **open pricing decision** in §8a — document shipped behaviour, not a settled tier.
- Use the product-neutral upsell copy (*"…let your agent and your flows remember…"*).
**Verify:** every claim traced to code (**never to code comments — several in the memory area were
stale and self-contradicting**); adversarial re-read of the privacy section; build passes.

### Phase C4c — NET-NEW **remaining undocumented features** (P1–P3 from §3.1b)
The docs currently document **none** of these. Author pages per the coverage matrix, in priority order:
- **P1 (admin/observability blind spots):** AI Spend / AI Gateway + usage ledger; Agent Activity /
  Oversight; Chat Analytics; **the overhaul UI + domain-nav IA** (every existing doc still describes
  legacy URLs — this one also feeds the C2/C3 trace passes).
- **P2 (user-facing, zero pages):** Knowledge Base; Chat / Chat-with-AI (+ compaction, sandbox);
  Leaderboard; Impact analytics; Platform Copilot.
- **P3 (PARTIAL → COVERED):** **Tables** (a first-class surface with NO docs nav entry), Managed Auth,
  Egress Proxy, Event Destinations, Alerts, License Keys, OAuth Apps, Formula.
- **Plans & entitlements reference** (cross-cutting): every undocumented `platform.plan.*` flag +
  `agentCaps`, and the two conventions — cap `0` = *not included* (upgrade prompt), `-1` = unlimited;
  the resolver **fails CLOSED for privileges, OPEN for metering**.
**Sizing note:** this is the single largest content workstream; it is batched per-feature, each with its
own code-trace + verification, and can run in parallel batches once the page map (M1 spec) is approved.
**Verify:** coverage matrix re-run — every P0–P3 item flips to COVERED or is explicitly deferred with a
reason; code-trace each new page; build passes.

### Phase C5 — Images (deferred per owner)
- Now: inventory ~104 stale screenshots per page + desired content; rename 21 branded files + fix refs;
  author any SVG diagrams/illustrations.
- Later (separate scheduled task): recapture the 104 UI screenshots vs a live seeded Intellisper app
  (human-in-the-loop).
**Verify:** broken-links (no dangling image refs).

### Phase C6 — Cutover & final verification
- Retire/redirect old `docs/` (Mintlify) once Docusaurus is authoritative; set up redirects for any
  changed slugs.
- Full `docusaurus build`, broken-links, a11y; nav-completeness diff (every original page present);
  rebrand residue grep clean; code-trace ledger complete.
- Deliver change summary + outstanding image-recapture task list + hosting/deploy runbook.

---

## 5. Cross-cutting rules (every phase)
- Writing style still follows `.agents/rules/mintlify.md` voice principles (second person, active,
  sentence-case headings, no marketing/filler, callouts by severity) — these are platform-agnostic good
  practice; only the component syntax changes for Docusaurus.
- **No assumptions:** every enum/limit/env/route/cap/flag confirmed vs code before writing; unconfirmable
  → `TODO` marker.
- **Never hide content:** page-set diff gates M1, M3, and C6; `docs/` kept until parity.
- Small, independently reviewable batches; verify before advancing.

## 6. Decisions LOCKED (owner) + remaining input
LOCKED:
- **Hosting:** Cloudflare Pages (free CDN, free custom domain + previews, no commercial-use limit).
- **Search:** local plugin `@easyops-cn/docusaurus-search-local` (offline, no account).
- **Placement:** standalone `docs-site/` (own package.json, NOT a bun-workspace member).
- **Theme:** build from Docusaurus `classic` + custom CSS/CSS-vars + minimal swizzling.

STILL NEEDED before the relevant phase:
1. **Studio/Agent IA skeleton** (tab layout) — confirm before M1.
2. **Canonical Intellisper URLs** (app, marketing, docs domain, CDN, GitHub org, socials, support
   emails) — I'll propose from code/config for confirmation in C1; never invented.

## 7. Risk register
- **MDX v3 strictness** (Phase M3) — the biggest migration risk; Mintlify MDX may use syntax MDX v3
  rejects. Mitigation: scripted transform + budget iteration; the parity gate catches all compile errors.
- **OpenAPI plugin fidelity** vs Mintlify's renderer — verify all 65 endpoints in M4.
- **Swizzle maintenance** — ejected theme components need care on Docusaurus upgrades; keep swizzles
  minimal, prefer CSS-var theming.
- **Self-hosting ownership** — you now own build/deploy/search (vs Mintlify-managed). One-time setup +
  a deploy runbook (C6) mitigates.
