# Frontend Overhaul — Implementation Progress

> Running tracker of what's built on branch `frontend-overhaul-intellisper`. Companion to the
> capability ledger, IA map, and design-language docs. Updated as surfaces land.

## Approach (DECIDED 2026-07-12): true interior rewrites, reuse logic only

**Every surface gets a genuine interior rewrite** — all-new presentation (layout, cards, panels,
filters UI, interactions, empty states, icons) written from scratch in the new shell. We **reuse only
the non-visual engine**: the existing data/mutation hooks (`use*Data`, `use*Mutations`, queries,
validation) and dialogs. This is a real revamp of everything the user sees, without re-deriving proven,
tested data plumbing.

- **NEW** = the target state for every surface (own components, real rewrite).
- **WRAP** (rendering an old page verbatim) has been **fully phased out** — Automations, the last WRAP,
  is now a true interior rewrite (all-new presentation, reuses only logic hooks). No WRAPs remain.

**Old routes: keep BOTH old + new live for now** (many in-app clickable elements still navigate to old
routes; cutting them prematurely breaks navigation). The **route-replacement map below** records which
old route each new one replaces, so the final cutover (swap old route element → redirect to new) is
mechanical. Ledger guards against capability loss throughout.

## Route-replacement map (for the final cutover)

When ready to cut over, replace each OLD route's element with a redirect to its NEW route (preserving
`:projectId` + query). Until then, both are live. `[ ]` = new route not built yet.

| OLD route (to retire) | NEW route (replacement) | New built? |
|---|---|---|
| `/` → `/flows` → `/projects/:id/automations` | `/home` (landing) + `/projects/:id/build/automations` | Home ✅ / Automations ✅ **true rewrite** |
| `/projects/:id/automations` | `/projects/:id/build/automations` | ✅ **true interior rewrite** (all-new UI; tsc+lint clean; ledger BLD-145..204 verified) |
| `/projects/:id/flows/:flowId` | *(kept as-is — full-canvas builder, NOT shell-wrapped per user decision 2026-07-13)* | ✅ **left as-is**; builder owns its layout/chrome (BLD-099..204); back-nav → automations. No shell wrap by design. |
| `/projects/:id/runs` | `/projects/:id/operate/runs` | ✅ **card gallery + table toggle** (shared `useRunsController`; gallery default; tsc clean; all 74 caps preserved incl. select-all+exclusions/bulk) |
| `/projects/:id/runs/:runId` | `/projects/:id/operate/runs/:runId` | [ ] (run-detail = readonly builder; deferred with Flow builder) |
| `/projects/:id/tables/:tableId` | `/projects/:id/data/tables/:tableId` | ✅ **editor wrapped in new shell** (data-grid untouched; rename/delete/import/export/push-to-git/rows/cols/cells/collab/counts all preserved; READ/WRITE_TABLE + hideTables gates kept; tsc+lint 0). List lives in Automations (no standalone list route). |
| `/projects/:id/connections` | `/projects/:id/connect/connections` | ✅ **card gallery + table toggle** (gallery default; reuses same connection hooks/dialogs; tsc clean; all caps preserved) |
| `/projects/:id/variables` | `/projects/:id/build/variables` | ✅ **card gallery + table toggle** in new shell (tsc clean; all caps preserved) |
| `/projects/:id/releases` (+ `/:releaseId`) | `/projects/:id/build/releases` (+ `/:releaseId`) | [ ] |
| `/impact` | `/insights/impact` | ✅ **new shell + overhaul variant** (metrics/trends/tabs/details-DataTable/CSV/refresh/time-period/project-select + analyticsEnabled gate all preserved; tables untouched; not project-scoped; tsc+lint 0). |
| `/leaderboard` | `/insights/leaderboard` | ✅ **new shell + overhaul variant** (People/Projects tabs, search, time-saved filter, CSV, badges, DataTables preserved; not project-scoped; tsc+lint 0). |
| `/templates` (+ `/:templateId`) | `/build/explore` (+ `/:templateId`) | ✅ **new shell + overhaul variant** (wraps TemplatesPage; search/category-carousels/all-categories/cards/official-custom/start-from-scratch/detail-nav preserved; not project-scoped; tsc+lint 0). Detail `/:templateId` stays on old route. |
| `/chat` (+ `/:conversationId`) | AI assistant (route TBD) | [ ] |
| `/platform/**` (all ~21 admin pages) | `/admin/**` | ✅ **shell-wrapped via single reusable `OverhaulAdminShell`** (all 21 pages + index redirects verbatim; admin sub-nav preserved as glass rail inside; key DataTable pages get glass card chrome, grids untouched; platform-admin + edition + plan-lock + embed gates reproduced; tsc+lint 0). |
| `/settings` (modal) | Project Settings surface via switcher | [ ] |
| auth/public runtimes (sign-in/up/forms/chat) | same paths, restyled in place | [ ] |

> Cutover recipe per row: keep the new route; change the OLD route's element to
> `<Navigate to={<new path with same :projectId + search>} replace />`. Do this only after in-app
> links have been repointed to new routes (or accept the redirect hop).

## Foundation (NEW, shared across all surfaces)

| Artifact | Path | Status |
|---|---|---|
| 3D icon system | `components/icons-3d/` (Icon3d, registry of 52 icons, defs) | ✅ built, wired at app root |
| Domain-nav app shell | `app/components/overhaul/new-app-shell.tsx` + `domain-nav.ts` | ✅ **REDESIGNED to mockup nav (2026-07-13)**: slim ICON RAIL (Home + 6 domains) + **pinned second-column DRAWER** listing the domain's sub-items (stays open until another domain picked / closed; auto-opens for the active route, persisted in `ib.nav.activeDomain`). Minimal top bar = ⌘K search + notifications + user profile only. All gates preserved (embed/admin/permission/plan-lock). tsc+lint 0. |
| Design-system utilities | `src/styles.css` | ✅ `ov-glass` (white-base glassmorphism, copper-tinted border), `ov-glass-hover`/`-on`, `ov-slide-in-left`, `ov-slide-in-up` — used by nav drawer + Connections/Runs galleries. |
| DataTable overhaul variant | `components/custom/data-table/index.tsx` — opt-in `variant="overhaul"` prop | ✅ sky-blue tinted/bordered header + colored rounded frame. Used as the TABLE half of each table page. Legacy pages default to `'default'` and are untouched. |

**⚠️ DIRECTION UPDATE (user, 2026-07-12):** table pages must have a *different layout/design/feel*, not just a re-skinned table. Decision: **card-gallery default + table toggle** (like Automations). Each table page (Variables/Runs/Connections/Templates) gets a premium card/grid gallery as the default view, with a toggle back to the overhaul-styled table. Both views reuse the SAME logic hooks/dialogs/actions so zero capability is lost. Gallery lives in each `overhaul-<page>/components/`; the toggle + persisted `ib.<page>.viewMode` localStorage key live in the `overhaul-<page>/index.tsx` shell page. Runs/Connections were shipped as table-only re-skins first and are being **retrofitted** with galleries.
| Capability ledger (~780 caps) | `docs/rewrite/frontend-overhaul-capability-ledger.md` (+ BLD/PLT companion files) | ✅ the lose-nothing gate |
| IA map (Home + 6 domains) | `docs/rewrite/frontend-overhaul-IA-map.md` | ✅ approved |
| Design language + icon spec | `docs/rewrite/frontend-overhaul-design-language.md` | ✅ approved |

## Pages built

| New page | Route | Mode | Replaces (old) | Status |
|---|---|---|---|---|
| Home command-center | `/home` | **NEW** | *(none — net-new landing; old default was `/automations`)* | ✅ built + polished + **user-approved** |
| Automations (in new shell) | `/projects/:projectId/build/automations` (+ bare `/build/automations` redirect) | **NEW (true rewrite)** | `/projects/:projectId/automations` | ✅ all-new presentation — `OvToolbar`/`OvPagination`/`OvSelectionBar`/`OvNoResults` + gallery/table + view-toggle + all 5 dialogs + `AutomationsEmptyState`; reuses only logic hooks (useAutomations Filters/Data/Selection/Mutations/Dialogs, usePinnedItems). tsc+lint exit 0; ledger BLD-145..204 (60 rows) all wired |
| Automations **gallery view** | (inside the automations page; Gallery/Table toggle, gallery default, persisted) | **NEW** | the classic table row view (kept as toggle) | ✅ built, ledger-verified BLD-145..162 (reusable in the rewrite) |
| Runs (Operate domain) | `/projects/:projectId/operate/runs` (+ bare redirect) | **RE-SKIN + new shell** | `/projects/:projectId/runs` | ✅ `OverhaulRunsPage` renders `RunsTable` verbatim with `variant="overhaul"`. Per user decision (table pages = re-skin, not from-scratch), the shared `DataTable` gained an opt-in `variant="overhaul"` (sky-blue header + colored frame; legacy pages untouched). All 74 runs caps preserved (URL-param filters, cursor pagination, select-all+exclusions, bulk archive/cancel/retry, queue chart, dialogs, polling). tsc+lint exit 0. Also fixed 2 pre-existing console errors surfaced on this page: nested-`<button>` in `DataTableInputCheckbox` (now `div role=button`) + spurious `getColumn` "column does not exist" warning (both call sites now use `getAllColumns().find`). |
| Connections (Connect domain) | `/projects/:projectId/connect/connections` (+ bare redirect) | **RE-SKIN + new shell** | `/projects/:projectId/connections` | ✅ `OverhaulConnectionsPage` renders `AppConnectionsPage` verbatim with `variant="overhaul"` (added a `variant` prop threaded to its `DataTable`). All caps preserved: status/block/name/owner filters (owner col+filter embed-gated), cursor pagination, bulk delete, New/Replace connection, rename / edit-global (project sharing + preSelect) / reconnect row actions, global-connection Globe badge, Flows-count link. tsc+lint exit 0. |

## Not yet started (planned, per IA map)

Build/Operate/Data/Connect/Insights/Admin domain interiors: Runs, Connections, Variables, Templates,
Impact, Leaderboard, Tables editor, Flow builder, and all platform-admin pages. Plus §5 features
(undo/redo, table sort/filter/paginate, latent-cap surfacing) folded in per surface.

## Automations true-rewrite plan (in progress)

Scope: rewrite EVERY visual piece (user decision), reuse only logic. The current page's logic body
(hooks + handlers + dialogs) is proven and stays; only the JSX + these presentation components get
all-new implementations, ledger-verified against BLD-145..204:
- filters + toolbar bar (search, type/status/connections/owner/folder filters, create-new menu,
  import menu, clear-all) — new UI.
- empty state (branded) + no-results state — new UI.
- pagination + bulk selection bar — new UI.
- create-new / create-in-folder menus — new UI.
Reused verbatim (logic, not visual): useAutomationsFilters/Data/Selection/Mutations/Dialogs,
usePinnedItems, handleRowClick (records access + ctrl-click new-tab), handleCreateInFolder, the
already-approved gallery + table views, and the row/card action menus.
New page lives at overhaul-automations; old AutomationsPage untouched (both routes live per route-map).

## Known follow-ups

- Automations row nav still targets OLD `/projects/:id/...` routes (opening a flow exits the new
  shell) — rewire when builder/table surfaces are rebuilt. No capability lost; nav target only.
- Verification process fix (self-note): always read **tsc's own raw exit code** with `.tsbuildinfo`
  cleared — never a grep-piped exit — after an IDE-caught error slipped past a stale/masked check.

## Commits (branch frontend-overhaul-intellisper)

ledger → IA → design → icons → Icon3d+shell+Home → polish → hero-fix → automations-route →
project-scoping fix → gallery view → gallery type-fix. (See `git log`.)
