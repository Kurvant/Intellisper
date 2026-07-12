# Frontend Overhaul — New Information Architecture (Pillar 2a)

> Re-architected IA for the Intellisper overhaul. User-approved direction (2026-07-12): **domain-grouped
> nav + a net-new Home command-center**. Every current route and every ledger capability maps into a
> domain here — nothing is orphaned. This is the "lose-nothing" structural map that the new nav is built
> from. Companion to the capability ledger (frontend-overhaul-capability-ledger.md).

## Design principles

1. **Home is a command center**, not a list. Landing surface aggregates: run-health, recent/favorite
   automations, impact snapshot, alerts, quick-create. Additive — pulls existing data together; no
   capability removed (the flows list still exists under Build).
2. **Six domains** replace the flat rail + separate platform rail. Domains group by *user intent*
   (what am I doing?), not by data type. Platform-admin surfaces fold into domains with an admin gate,
   plus a dedicated **Admin** domain for platform-scoped config.
3. **⌘K command bar** elevated to a primary navigation + action method (already exists; promoted).
4. **Full-screen focus modes** for the two deep surfaces (Flow Builder, Table Editor) — they take over
   the viewport, exit back to their domain.
5. **Gating unchanged** — every permission/edition/plan/embed gate from the ledger still applies; a
   domain or item is hidden/locked exactly as its capabilities are today.

## The six domains (+ Home) and what maps into each

### 🏠 Home (net-new command center) — landing route
Aggregates (read-only surfaces of existing data; each links into its domain):
- Run-health summary card (from RUN-26 queue stats / PLT-134 runs health).
- Recent & favorite automations (from BLD-149 pins, automations list).
- Impact snapshot (from ANL-01.. summary metrics).
- Active alerts / failures (from RUN failures, ALT alerts).
- Quick-create (New Flow / Table / Connection — BLD-186.., CON-01, TBL create).
- AI assistant entry (AIC — "Ask Intellisper").
> New capability rows (additive): H1 run-health tile, H2 recent list, H3 impact tile, H4 alerts tile,
> H5 quick-create, H6 assistant entry. None remove existing caps.

### 🔧 Build — authoring
- **Automations** (flows+tables+folders list) — BLD-145..204 (list/filters/bulk/create/import/folders).
- **Flow Builder** (full-screen focus) — BLD-001..144 (canvas/nodes/context-menu/settings/notes/etc.).
- **Table Editor** (full-screen focus) — TBL-01..42.
- **Templates / Explore** — TPL-01..15.
- **Variables** — VAR-01..10 (+ §5-A6 reveal surfaced here).
- §5 additions land here: A1 builder undo/redo, A2 table undo/redo, A3-A5 table sort/filter/paginate.

### ⚙️ Operate — running & monitoring the automations you built
- **Runs** (list + detail) — RUN-01..30.
- **Run detail / read-only builder** — RUN-30 / BLD readonly.
- **Live run following** — BLD-094..098.
- (Project-scoped health view could surface here too, read-only.)

### 🗄️ Data — the data your automations use
- **Tables** (list) — enters Table Editor (Build).
- **Table records / import / export** — TBL import/export rows.
- (Tables appears in both Build[authoring] and Data[managing]; same surface, two entry points.)
> Decision: to avoid duplication, Tables *lives* in Build (editor) but is *linked* from Data. Data domain
> is primarily Tables + Variables browsing. Keep it light; don't split the table editor.

### 🔌 Connect — integrations & credentials
- **Connections** (project) — CON-01..24.
- **Global Connections** (platform) — CON-25..29, PLT-024..030 (admin-gated).
- **Blocks** (installed integrations) — PLT-050..061 (admin) + block browsing.
- **Secret Managers** — SMG-001..017 / PLT-083..091 (admin-gated).
- **MCP** (project + platform) — SET-06 / PLT-046..049.

### 📊 Insights — analytics & observability
- **Impact** (analytics) — ANL-01..11.
- **Leaderboard** — ANL-12..19.
- **Audit Logs** — PLT-092..099 (admin).
- **Chat Analytics** — PLT-144..150 (admin).
- **Trigger Health / Runs Health / Queue Health** — PLT-130..136 (admin, read-only).

### 🛡️ Admin — platform-scoped configuration (admin-gated domain)
- **Projects** (platform mgmt) — PLT-001..009.
- **Users & Members** — PLT-010..015, MEM-01..13.
- **Project Roles** — PLT-100..107.
- **SSO / Auth** — PLT-116..125.
- **API Keys** — PLT-080..082.
- **Embed** — PLT-108..115.
- **Event Destinations** — PLT-137..143.
- **Branding** — PLT-067..073.
- **AI Providers** — PLT-031..045.
- **Templates (custom mgmt)** — PLT-062..066.
- **Billing** — PLT-074..079, BILL-001..065.
- **Workers / Infrastructure** — PLT-126..129.

### Cross-cutting (not a domain — always-present shell)
- **⌘K Command bar** — SHL-04..08 (promoted to primary).
- **User menu / Account settings** — SHL-15, SHL-20..23.
- **Project switcher / Platform switcher** — SHL-01..03, PRJ-03.
- **Project settings** (modal today) → becomes a proper **Project Settings** surface reachable from
  the project switcher; tabs SET-01..09 preserved (General/Members/Alerts/Blocks/Environment/MCP).
- **Help & Feedback** — SHL-16.
- **Notifications** — net-new candidate (§5): surfaces run failures/alerts/badges (today toast-only).
- **Auth/onboarding** (sign-in/up/etc.) — AUTH-* unchanged, restyled.
- **Public runtimes** (forms/chat) — FRM/PCH unchanged, restyled.
- **AI Assistant** (⌘/ or Home entry) — AIC-01..49.
- **Embed mode** — all SHL-38 hide-flags still honored; domains collapse per flags.

## Route mapping (old → new)

| Old route | New location |
|---|---|
| `/` (→flows) | `/home` (command center) — flows list now `/build/automations` |
| `/automations` | `/build/automations` |
| `/flows/:id` | `/build/flow/:id` (full-screen) |
| `/runs`, `/runs/:id` | `/operate/runs`, `/operate/runs/:id` |
| `/tables/:id` | `/build/table/:id` (full-screen; linked from Data) |
| `/connections` | `/connect/connections` |
| `/variables` | `/build/variables` (linked from Data) |
| `/releases` | `/build/releases` (or Operate; TBD) |
| `/impact`, `/leaderboard` | `/insights/impact`, `/insights/leaderboard` |
| `/templates` | `/build/explore` |
| `/chat` | AI assistant (overlay/route) |
| `/platform/**` | `/admin/**` (+ Insights for observability pages) |
| `/settings` (modal) | Project Settings surface via switcher |
| auth/public routes | unchanged paths, restyled |

> IMPORTANT: old routes should **redirect** to new ones (no broken links / bookmarks). Add redirect
> entries so `/automations` → `/build/automations` etc. This is a capability-preservation requirement.

## Nothing-lost check

Every ledger cluster maps to a domain above: BLD→Build/Operate, TBL→Build/Data, CON→Connect, VAR→Build/Data,
RUN→Operate, FRM/PCH→public runtimes, AIC→assistant, PLT→Admin/Insights/Connect, AUTH→auth, BILL→Admin,
SMG→Connect/Admin, TPL→Build, PRJ→Admin+switcher, MEM→Admin, ALT→settings, REL→Build/Operate, ANL→Insights,
SET→Project Settings, SHL→shell. No cluster is orphaned. Old routes redirect. Gates preserved.

## Build progress notes (Pillar 3)

- **Home** (`/home`) — new command-center, built + polished + user-approved.
- **Automations** (`/build/automations`) — capability-preservation by REUSE: renders the existing
  `<AutomationsPage/>` verbatim inside `NewAppShell`. All BLD-145..204 list capabilities preserved
  (same component). KNOWN FOLLOW-UP: the reused page's row nav uses `appendProjectRoutePrefix`, so
  opening a flow/table navigates to the OLD `/projects/:id/...` routes (exits the new shell). That's
  fine for the additive proof-of-concept; rewiring builder/table nav into the new shell is a later
  step once those surfaces are rebuilt. No capability lost — navigation target only.
- Strategy going forward: prefer WRAPPING existing capable page-content components in `NewAppShell`
  over rewriting, wherever the component is layout-agnostic (returns content, not chrome). Rewrite
  only where the new IA genuinely changes the interaction (Home, and later the builder/table shells).
