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
- **WRAP** (rendering an old page verbatim) is being **phased out** — the one current WRAP (Automations)
  is scheduled for a true interior rewrite. No new WRAPs.

**Old routes: keep BOTH old + new live for now** (many in-app clickable elements still navigate to old
routes; cutting them prematurely breaks navigation). The **route-replacement map below** records which
old route each new one replaces, so the final cutover (swap old route element → redirect to new) is
mechanical. Ledger guards against capability loss throughout.

## Route-replacement map (for the final cutover)

When ready to cut over, replace each OLD route's element with a redirect to its NEW route (preserving
`:projectId` + query). Until then, both are live. `[ ]` = new route not built yet.

| OLD route (to retire) | NEW route (replacement) | New built? |
|---|---|---|
| `/` → `/flows` → `/projects/:id/automations` | `/home` (landing) + `/projects/:id/build/automations` | Home ✅ / Automations ✅ (wrap→rewrite pending) |
| `/projects/:id/automations` | `/projects/:id/build/automations` | ✅ (currently WRAP; rewrite pending) |
| `/projects/:id/flows/:flowId` | `/projects/:id/build/flow/:flowId` | [ ] |
| `/projects/:id/runs` | `/projects/:id/operate/runs` | [ ] |
| `/projects/:id/runs/:runId` | `/projects/:id/operate/runs/:runId` | [ ] |
| `/projects/:id/tables/:tableId` | `/projects/:id/build/table/:tableId` | [ ] |
| `/projects/:id/connections` | `/projects/:id/connect/connections` | [ ] |
| `/projects/:id/variables` | `/projects/:id/build/variables` | [ ] |
| `/projects/:id/releases` (+ `/:releaseId`) | `/projects/:id/build/releases` (+ `/:releaseId`) | [ ] |
| `/impact` | `/insights/impact` | [ ] |
| `/leaderboard` | `/insights/leaderboard` | [ ] |
| `/templates` (+ `/:templateId`) | `/build/explore` (+ `/:templateId`) | [ ] |
| `/chat` (+ `/:conversationId`) | AI assistant (route TBD) | [ ] |
| `/platform/**` (all ~21 admin pages) | `/admin/**` (+ Insights for observability) | [ ] |
| `/settings` (modal) | Project Settings surface via switcher | [ ] |
| auth/public runtimes (sign-in/up/forms/chat) | same paths, restyled in place | [ ] |

> Cutover recipe per row: keep the new route; change the OLD route's element to
> `<Navigate to={<new path with same :projectId + search>} replace />`. Do this only after in-app
> links have been repointed to new routes (or accept the redirect hop).

## Foundation (NEW, shared across all surfaces)

| Artifact | Path | Status |
|---|---|---|
| 3D icon system | `components/icons-3d/` (Icon3d, registry of 52 icons, defs) | ✅ built, wired at app root |
| Domain-nav app shell | `app/components/overhaul/new-app-shell.tsx` + `domain-nav.ts` | ✅ built (rail + topbar; reuses real search/user/gating) |
| Capability ledger (~780 caps) | `docs/rewrite/frontend-overhaul-capability-ledger.md` (+ BLD/PLT companion files) | ✅ the lose-nothing gate |
| IA map (Home + 6 domains) | `docs/rewrite/frontend-overhaul-IA-map.md` | ✅ approved |
| Design language + icon spec | `docs/rewrite/frontend-overhaul-design-language.md` | ✅ approved |

## Pages built

| New page | Route | Mode | Replaces (old) | Status |
|---|---|---|---|---|
| Home command-center | `/home` | **NEW** | *(none — net-new landing; old default was `/automations`)* | ✅ built + polished + **user-approved** |
| Automations (in new shell) | `/projects/:projectId/build/automations` (+ bare `/build/automations` redirect) | **WRAP → rewrite pending** | `/projects/:projectId/automations` | ⚠️ currently wraps existing page; scheduled for true interior rewrite (own filters bar/toolbar/empty-states in new shell, reusing use*Data/use*Mutations) |
| Automations **gallery view** | (inside the automations page; Gallery/Table toggle, gallery default, persisted) | **NEW** | the classic table row view (kept as toggle) | ✅ built, ledger-verified BLD-145..162 (reusable in the rewrite) |

## Not yet started (planned, per IA map)

Build/Operate/Data/Connect/Insights/Admin domain interiors: Runs, Connections, Variables, Templates,
Impact, Leaderboard, Tables editor, Flow builder, and all platform-admin pages. Plus §5 features
(undo/redo, table sort/filter/paginate, latent-cap surfacing) folded in per surface.

## Known follow-ups

- Automations row nav still targets OLD `/projects/:id/...` routes (opening a flow exits the new
  shell) — rewire when builder/table surfaces are rebuilt. No capability lost; nav target only.
- Verification process fix (self-note): always read **tsc's own raw exit code** with `.tsbuildinfo`
  cleared — never a grep-piped exit — after an IDE-caught error slipped past a stale/masked check.

## Commits (branch frontend-overhaul-intellisper)

ledger → IA → design → icons → Icon3d+shell+Home → polish → hero-fix → automations-route →
project-scoping fix → gallery view → gallery type-fix. (See `git log`.)
