# Frontend Redesign — Implementation Ordering (file-level)

> Companion to `frontend-redesign-plan.md`. That doc is the *what* (capabilities that must not be
> lost) and the *why*. This doc is the *exact order of execution* — the pages, components, and files
> touched in each phase, in the order they're touched, with the verification gate that closes each
> phase. Scope is fixed: **re-skin + per-page layout polish, zero behavior change.** "Improve/add"
> means visual/layout only; all behavior changes stay in `frontend-redesign-plan.md` §5.
>
> All paths are under `packages/web/src/` unless noted. The tree moves — re-glob before trusting a list.

## How theming actually flows (the mechanic every phase relies on)

1. `src/styles.css` — Tailwind v4 entry. `@import 'tailwindcss'`, `@theme { --color-* }` maps CSS
   vars → Tailwind color utilities, keyframes, fonts (Sentient + Inter). Imports `styles/globals.css`.
2. `src/styles/globals.css` — `:root` (light) + `.dark` token *values* (the ~130-line block:
   background/foreground/primary/secondary/accent/muted/border/ring/success/destructive/warning ramps,
   sidebar-*, builder-*, chart-*), plus scrollbars, formula-pill, welcome-gradient.
3. `components/providers/theme-provider.tsx` — at runtime overrides `--primary`, `--primary-100`,
   `--primary-300`, favicon, title from branding. **White-label + dark mode both live here.**

   > **CRITICAL (discovered during Phase 1.1): the primary color has TWO sources that MUST agree.**
   > `theme-provider` unconditionally sets `--primary`/`--primary-100`/`--primary-300` from the server
   > `THEME` flag's `colors.primary.{default,light,dark}` on every render. So the CSS `--primary` in
   > `globals.css` is only the *pre-hydration default*; once flags load, the server value wins. The
   > server default lives at **`packages/server/api/src/app/flags/theme.ts`** →
   > `defaultTheme = generateTheme({ primaryColor: '#...' })` (was `#6e41e2` purple, now `#b5652f`
   > copper). `light`/`dark` are derived from it via tinycolor. **To change the app-wide primary you MUST
   > edit BOTH** the server default (theme.ts) AND the CSS default (globals.css `--primary*`) so pre- and
   > post-hydration match. Platform admins can still override via the Branding page (white-label path
   > intact). This is the one server-side file the re-skin touches, and only for the default color.
4. `components/ui/*` (42 shadcn primitives) — consume the tokens via Tailwind classes
   (`bg-background`, `text-muted-foreground`, `border-border`, etc.).
5. Feature components consume primitives.

**Consequence:** the re-skin's center of gravity is (2) the token values + (4) the primitives. Editing
those two propagates to 900+ files without touching them. Feature-level phases (2–8) are layout polish
+ any local hardcoded colors that bypass tokens, NOT re-implementations.

**Color-harmonization rule (user decision 2026-07-12): harmonize CATEGORY colors to the brand ramp,
but NEVER touch STATUS semantics.**
- **Harmonize** (map to the brand chart ramp — copper `--chart-1`, Kurvant blue `--chart-2`, violet
  `--chart-3`, yellow `--chart-4`, emerald `--chart-5`): entity-type icon colors (flow/table/folder/page),
  decorative metric-card accents, and any categorical/series coloring that is NOT conveying good/bad state.
- **NEVER change** (semantic status must keep its meaning): success = green/emerald, warning = amber,
  error/destructive = red/rose, "Live"/enabled = green, paused = amber, failed = red. A failed run must not
  become copper. Use the `--success`/`--warning`/`--destructive` tokens for these.
- When in doubt whether a color is "category" or "status": if it answers *what kind of thing is this* →
  category (harmonize). If it answers *is this good/bad/healthy* → status (leave). Tables=emerald is a
  category color → it MAY move to `--chart-5` (still emerald) or another ramp slot; success=emerald is a
  status → leave. (In practice tables mapping to `--chart-5` emerald keeps it visually stable.)

**Global invariants for every phase (never violate):**
- Only change className/markup/token/layout. Never change hooks, queries, mutations, event handlers,
  props contracts, permission/edition/embed gates, i18n keys, or state.
- Replace hardcoded colors with tokens; never replace a token with a hardcoded color.
- Preserve every `data-*`/`id`/`aria-*` used by tests, portals (`#dashboard-content-container`),
  shortcuts, or e2e.
- After each file batch: `npm run typecheck` + `npm run lint` on touched files. Phase gate adds visual
  verification across CE/EE/Cloud + embed + one non-English locale + docs screenshot refresh.

---

## Phase 0 — Baseline & rebrand-debt (no re-skin yet)

**0.1 Visual + state baseline.** Capture current UI per route (editions/embed/locale) for diffing;
snapshot the i18n key set (`public/locales/en/translation.json`). No code.

**0.2 Rebrand-debt — DEFERRED to the separate rebrand sweep (NOT done in the re-skin).**
On close inspection the `activepieces.com` references split into three buckets, and only one is even
arguably safe to touch during a zero-regression re-skin — so all of it is deferred to the rebrand sweep
(same bucket as the docs terminology). Rationale, so it isn't re-litigated:
- **Live asset URLs** (`cdn.activepieces.com/pieces/*.png` provider/piece logos;
  `cdn.activepieces.com/videos/showcase/*.mp4` lock-feature videos; the auth-bg image). Swapping these to a
  non-existent intelblocks CDN **breaks the images/videos** — a regression. Blocked on real replacement
  assets. DO NOT touch in the re-skin.
- **Config / behavior** (`lib/api.ts` API base fallback `cloud.activepieces.com`;
  `features/billing/components/ai-credits/ai-credit-usage.tsx` `hostname.includes('cloud.activepieces.com')`
  AI-credit gating). Changing these alters behavior (API target / who sees AI credits) — out of scope for a
  re-skin. DO NOT touch here.
- **Marketing/doc links** (`activepieces.com/pricing`, `/docs`, `sales.activepieces.com`, changelog). Only
  safe to retarget once intelblocks equivalents exist; retargeting to dead URLs is worse than leaving them.
  Deferred to the rebrand sweep.

Net: **Phase 0 does no code changes.** It is baseline capture only. The re-skin begins at Phase 1.1.

**Gate 0:** baseline captured (screenshots + i18n key snapshot); feature branch created; typecheck baseline
recorded. No code changed.

---

## Phase 1 — Design tokens & primitives (the whole-app re-skin)

**1.1 Tokens (do first — smallest change, largest blast radius).** Order:
1. `styles/globals.css` — retune `:root` + `.dark` token values (the new palette/ramps, radius,
   sidebar-*, builder-*, chart-*). This is THE re-skin edit.
2. `styles.css` — `@theme` block if new color families / fonts / animations are added; font-face if
   the type system changes.
3. `components/providers/theme-provider.tsx` — only if the branding-injected var names change (avoid;
   keep `--primary*` contract).
Verify after 1.1: whole app re-colors; dark mode + white-label still resolve; contrast/AA holds.

**1.2 Primitives (42, in dependency order — leaves before composites).** Batch A (atoms):
`button, input, textarea, label, badge, checkbox, radio-group, switch, toggle, slider, separator,
skeleton, progress, avatar, tooltip, spinner(custom)`. Batch B (containers):
`card, alert, dialog, sheet, drawer, popover, hover-card, dropdown-menu, context-menu, accordion,
collapsible, tabs, scroll-area, resizable-panel`. Batch C (composite/data):
`table, form, select, command, calendar, carousel, chart, sonner, breadcrumb, sidebar-shadcn,
sortable, virtualized-scroll-area, text-shimmer`.
Rule: change only tokenized classes/variants (e.g. `cva` variant styles). Keep every variant name,
prop, and `forwardRef`. If a variant's look changes, keep its NAME so 900 call-sites are unaffected.

**1.3 Shared custom components in `components/custom/` (~60).** Re-skin the app-specific shared
widgets that aren't pure shadcn but are used everywhere: `data-table/*, page-header, empty,
loading-screen, route-loading-bar, search-input, searchable-select, multi-select, color-picker,
editable-text, ap-avatar, full-logo, status-icon-with-text, locked-alert, permission-needed-tooltip,
resource-lock-widget, active-users-widget, json-viewer, markdown, tag-input, dictionary-input,
array-input, date-time-picker-range, delete-dialog, shortcut`, etc.

**Gate 1:** typecheck + lint clean; every primitive + custom shared component visually updated; dark +
white-label verified; **no variant/prop/name removed**; docs screenshot refresh for any doc image that
is a bare component shot.

---

## Phase 2 — App shell & navigation

Order (outer → inner):
1. `app/app.tsx` (only if wrapper markup/theme classes) — do not touch provider order/logic.
2. Layouts: `app/components/project-layout/*` (index, `project-dashboard-layout-header`,
   `project-dashboard-page-header`), `app/components/platform-layout.tsx`,
   `app/components/builder-layout/index.tsx`, `app/components/centered-page.tsx`.
3. Sidebars: `app/components/sidebar/dashboard/index.tsx`, `sidebar/platform/index.tsx`,
   `sidebar/ap-sidebar-item.tsx`, `sidebar/ap-sidebar-group.tsx`, `sidebar/project/index.tsx`,
   `sidebar/sidebar-header.tsx`, `sidebar/sidebar-user.tsx`, `sidebar/sidebar-usage-limits.tsx`,
   `sidebar/platform/*` sub-items.
4. Global search: `app/components/global-search/*` (command palette, results, footer hints).
5. User/account: `app/components/account-settings/*` (index, theme-toggle, language-toggle,
   delete-account), `app/components/help-and-feedback.tsx`, `app/components/page-title.tsx`,
   `app/components/project-avatar.tsx`, `badge-celebrate.tsx`.
6. Switchers: `features/projects/components/platform-switcher.tsx`, `create-platform-dialog.tsx`.
**Preserve:** every embed `hide*` branch, `⌘K` handler, portal id `#dashboard-content-container`,
lock/badge/notification affordances, `useIsPlatformAdmin` redirects.

**Gate 2:** nav parity across editions; embed hides exactly what it hid; gating icons intact;
typecheck+lint clean; docs screenshot refresh (nav/shell shots).

---

## Phase 3 — Dashboard list surfaces (DataTable-driven; re-skin the shared table once)

Order (shared first, then each list):
1. `components/custom/data-table/*` — the shared list engine (already touched in 1.3; finalize here:
   toolbar, filters, bulk-action bar, pagination, selection, empty/skeleton).
2. Automations: `app/routes/automations/index.tsx` + `features/automations/components/*`
   (filters, table, table-row, pagination, selection-bar, empty/no-results, create-new-menu,
   move-to-folder/rename/create-folder dialogs).
3. Connections: `app/routes/connections/index.tsx`; `app/connections/*` (create-edit dialog + all
   auth-type settings + new/reconnect/replace/multi-auth/secret-input);
   `features/connections/components/*` (rename, edit-global).
4. Variables: `app/routes/variables/index.tsx`, `app/variables/variable-dialog.tsx`.
5. Runs list: `features/flow-runs/components/runs-table/*` (index, columns, status-chart,
   failed-step/failed-retry dialogs, retried-runs-snackbar).
6. Templates: `app/routes/templates/*` (library, category views, details, cards, skeletons);
   `features/templates/components/*` (browse-dialog, use-template, share-template, explore-card).
7. Projects/Members: `features/projects/components/*` (new/edit-project, ap-project-display);
   `features/members/components/*` (invite-user/*, edit-role, role selectors, cards, accept-invitation).
8. Releases: `app/routes/project-release/*`; `features/project-releases/components/*` (create-release,
   apply-plan, selection dialogs, connect-git, push-to-git, push-everything).
9. Impact + Leaderboard: `app/routes/impact/*` (summary, trends, details, edit-time-saved),
   `app/routes/leaderboard/*` (users/projects leaderboards, rank icons, filters).
**Preserve:** URL-synced filters, select-all/exclusion + folder-cascade semantics, per-action perms,
LockedFeatureGuard placements, `meta:{showErrorDialog}` on primary queries.

**Gate 3:** each list's filters/bulk/pagination/URL-state/gates verified; typecheck+lint; docs shots.

---

## Phase 4 — Platform admin (~21 pages)

Order (by sidebar group; reuse the Phase-3 DataTable skin):
1. General: `app/routes/platform/projects/*`, `platform/users/*` (+ actions), `platform/connections/*`.
2. Setup: `platform/setup/ai/*` (+ universal-pieces provider dialogs/sub-forms),
   `platform/setup/mcp/*`, `platform/setup/branding/*`, `platform/setup/connections/*`,
   `platform/setup/pieces/*` (block actions, oauth2 dialog, tags, sync), `platform/setup/templates/*`.
3. Security: `platform/security/sso/*` (saml-dialog, allowed-domain), `platform/security/project-role/*`
   (dialog, tables, users-table), `platform/security/api-keys/*` (new-api-key dialog = secret-once),
   `platform/security/secret-managers/*` (connect dialog + provider util),
   `platform/security/embed/*` (stepper + steps), `features/platform-admin/components/new-signing-key-dialog.tsx`.
4. Observability: `platform/security/audit-logs/*`, `platform/infra/event-destinations/*`,
   `platform/infra/chat-analytics/*`.
5. Infrastructure: `platform/infra/workers/*`, `platform/infra/health/*` (+ tabs/components),
   `platform/infra/triggers/*`.
6. Billing: `app/routes/platform/billing/index.tsx`, `features/billing/components/*`
   (subscription-info, active-flows-addon, ai-credits/*, license-key, features-status, success, error).
**Preserve:** every LockedFeatureGuard (copy/video/docs/contact-sales), secret-once + edit-mode secret
preservation, provider-specific dynamic sub-forms, per-page permission gates.

**Gate 4:** locked states + secret flows + dynamic sub-forms verified per page; typecheck+lint; shots.

---

## Phase 5 — Auth / onboarding / billing dialogs / public runtimes

Order:
1. Auth shell: `features/authentication/components/auth-form-template.tsx` (+ AuthLayout),
   `sign-in-form`, `sign-up-form`, `third-party-logins`, `saml-login-form`, `reset-password-form`,
   `change-password`, `verify-email`, `check-email-note`, `password-validator`.
2. Auth routes: `app/routes/{sign-in,sign-up,forget-password,change-password,create-platform}`,
   `app/routes/authenticate`, `app/routes/redirect.tsx`, `app/routes/mcp-authorize/*`.
3. Public runtimes: `features/forms/components/ap-form.tsx` + `app/routes/forms/*`;
   `app/routes/chat/flow-chat.tsx` + `features/chat/*` public bits + `app/routes/chat/*` (public),
   image-dialog, error-bubble, chat-intro.
4. Billing checkout/return: `features/billing/components/{success,error}.tsx`, purchase dialogs
   (active-flows, ai-credits, auto-topup) — if not fully covered in Phase 4.
**Preserve:** forced-light-mode on AuthLayout, white-label logo/branding, error-code→i18n maps,
`?from`/query-string preservation, version-gated form encoding, redirect/popup-relay logic.

**Gate 5:** every edition/flag branch on auth; redirect + query preservation; public form/chat submit
paths; typecheck+lint; docs screenshot refresh (auth/onboarding shots).

---

## Phase 6 — AI assistant chat (isolate; high interaction density)

Order:
1. Shell: `app/routes/chat-with-ai/index.tsx`, `conversation-list`, `chat-empty-state`,
   `chat-model-selector`, `credits-banner`.
2. Message stream: `ai-chat-box`, `components/chat-input`, streaming-text, copy-icon-button,
   thinking/reasoning accordions, batch-progress.
3. Interactive gate cards: action-preview, connection-picker, connections-required, project-picker,
   multi-question-form, quick-replies (+ `chat-bottom-bar`).
4. Voice/TTS: `use-voice-input`, `voice-waveform`, `use-tts` (visual only — no behavior change).
**Preserve:** streaming/stop/re-entry, every gate resolve path, credits thresholds, model tiers,
`chat-store`/reducer state, socket events. Do NOT touch `use-chat.ts`/`use-streaming-reducer.ts`/
`chunk-reducer.ts` logic — presentation components only.

**Gate 6:** streaming + stop + mid-stream re-entry; each gate card; credits states; typecheck+lint.

---

## Phase 7 — Tables editor (keep react-data-grid; re-skin only)

Order:
1. `app/routes/tables/id/react-data-grid.css` — grid theming (rows, headers, frozen cells, locked-row
   orange, selection, summary row). Central visual file.
2. `features/tables/components/*` — header, footer, field-header, new-field-popup, rename-field,
   field-action-menu, import-table-dialog, fields-mapping, actions-menu, state-provider (visual only).
3. Cell editors: `editable-cell`, `text/number/date/dropdown-editor`, `select-column`, `table-columns`
   (className/token only — keep type-to-edit, arrow-nav, commit/focus logic untouched).
4. `app/routes/tables/id/index.tsx` — page chrome.
**Preserve:** type-to-edit, boundary arrow-nav + re-focus, resource lock + agent-run row lock,
optimistic PromiseQueue "Saving…", import/export paths, all react-data-grid handles/ids.

**Gate 7:** edit modes, nav, locks, import/export, saves; dark mode grid; typecheck+lint; shots.

---

## Phase 8 — Flow builder (LAST — riskiest; xyflow + dnd-kit)

Order (chrome → canvas → panels, safest → deepest):
1. Header/chrome: `app/builder/index.tsx`, `builder-header/*` (header, flow-status, breadcrumb),
   `sidebar-header.tsx`, `app/components/flow-actions-menu.tsx`, widgets/banners
   (`flow-canvas/widgets/*`, `builder-banner`).
2. Canvas controls (non-graph): `flow-canvas/canvas-controls/*` (zoom/fit/minimap/screenshot/
   orientation/grab-select/add-note).
3. Nodes/edges (visual tokens only — builder-* tokens): `flow-canvas/nodes/*` (step-node, big-add,
   note-node, loop, flow-end), `flow-canvas/edges/*` (add-button, router/loop edges). Keep xyflow
   node/edge types, handles, dnd-kit droppables, drop-target ids.
4. Context menu + notes: `flow-canvas/context-menu/*`, `note-node` + `note-tools` (keep readonly-edit
   rule + all 12 conditional items).
5. Step settings + panels: `step-settings/*` (piece-settings, code-settings, router-settings,
   branch-settings, step-data panels, test sections, connection-select), `run-list/*`,
   `flow-versions/*`, `data-selector/*`, `pieces-selector/*`, text-input-with-mentions.
**Preserve:** every keyboard shortcut (`shortcuts.ts`), context-menu items, paste targets, drag paths,
readonly rules (notes editable in readonly!), publish/draft lifecycle, auto-save PromiseQueue,
localStorage prefs (orientation/panning/panel), embed flags, socket run-progress.

**Gate 8:** full builder walkthrough — add/move/copy/paste/skip/delete steps, all paste targets,
shortcuts, context menu, notes, router branches, code editor, test/run + live follow, versions,
publish, readonly run view, embed flags. typecheck+lint; docs screenshot refresh (builder shots).

---

## Hardcoded-color worklist (token-only re-skin does NOT catch these — fix in the owning phase)

Audit finding (Phase 1): the 42 primitives + ~60 shared customs are token-driven — **0 primitive files and
essentially 0 shared customs needed edits** (chart.tsx `#ccc/#fff` are Recharts override-selectors, not
colors; color-picker/alert-icon/avatar literals are intentional). BUT several **feature files hardcode the
OLD purple/violet primary** and will stay purple unless edited. Assign each to its phase:

- **Phase 5 (auth):** `features/authentication/components/auth-animation.tsx` — ~20 `violet-*`/`fuchsia-*`/
  `#8b5cf6` usages (the sign-up hero animation; a brand surface → recolor to copper/Kurvant).
- **Phase 3 (impact/lists):** `app/routes/impact/summary/active-flows-metric.tsx` (`text-purple-500`,
  `bg-purple-500/10`); `app/routes/impact/trends/runs-chart.tsx` (`color="#8b5cf6"` → use `--chart-*`).
- **Phase 4 (platform):** `app/routes/platform/infra/health/components/runs-tab.tsx` (`text-purple-500`);
  `features/billing/components/enable-ai-credits-overage.tsx` (`bg-purple-50`).
- **Phase 2 (shell):** `app/components/global-search/search-result-item.tsx` (`text-violet-500!`).
- **Leave as-is (intentional, NOT primary leaks):** `note-tools.tsx` PURPLE (a user-selectable note color);
  `text-input-with-mentions/.../function-hover-popover.tsx` purple (formula syntax highlighting — decide in
  Phase 8 whether to tokenize).

Re-run this audit per phase: `grep -rnE "(bg|text|border|ring|from|to|via|fill|stroke)-(purple|violet|indigo)-[0-9]|#6e41e2|#7c3aed|#8b5cf6" <phase paths>`.

## Cross-phase verification ledger (run at every gate)

- `npm run typecheck` (whole package) — must be clean.
- `npm run lint` on touched files (`NODE_OPTIONS=--max-old-space-size=8192`) — clean.
- Manual/visual: light + dark; CE + EE + Cloud; embed mode; ≥1 non-English locale.
- Capability checklist (`frontend-redesign-plan.md` §2/§3) for the phase's surfaces — all green.
- Docs screenshot refresh for the phase's surfaces.
- Zero diffs to: hooks, queries/mutations, event handlers, prop contracts, i18n keys, gates, state.
