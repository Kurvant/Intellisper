# Frontend Redesign Plan & Capability Inventory (blockunits Web)

> **Purpose.** This is the "lose-nothing" acceptance gate for the UI/frontend revamp that
> ships alongside the piece→block / `@activepieces`→`@intelblocks` rebrand. Every capability
> listed here must remain reachable in the redesigned UI — or be changed only by an explicit,
> recorded decision. Derived from a full read of `packages/web/src` (routes, features, app
> shell). The tree moves: verify file/line against the current source before relying on any
> pointer.

## Confirmed scope (locked)

- **Scope:** **Re-skin + per-page layout polish.** New visual design + per-page
  layout/spacing/hierarchy improvements. **Same navigation structure, same set of pages.**
  No information-architecture changes (no regrouped nav, no merged/split pages).
- **Heavy widgets:** **Keep & re-skin both** the flow-builder canvas (`@xyflow/react`) and the
  tables grid (`react-data-grid`). Restyle via tokens/CSS; **preserve all behavior**. No library
  replacement.
- **New/"better" features:** **None in this effort.** Ship the visual revamp with **zero
  behavior changes**. All candidate behavior improvements are recorded in
  **§5 Deferred behavior-change checklist** and scoped as separate later work — they must NOT be
  smuggled into the re-skin.
- **Guiding principle:** change the **skin before the structure**. Re-theme through tokens first
  (whole-app payoff, low risk), then page chrome, then the deep interactive surfaces last.

---

## 0. Foundation facts (the anchors a re-skin rides on)

- **Stack:** React + Vite SPA. React Router (browser router normally, **memory router in embed
  mode**). TanStack Query (data), TanStack Table/Virtual (lists), TanStack DB (a few collections,
  e.g. projects). Zustand (builder, tables, chat interaction state). shadcn "new-york" + radix
  (42 UI primitives in `components/ui/`). **Tailwind v4** — config-less `@theme` block in
  `src/styles.css`; `@custom-variant dark (&:is(.dark *))`. `components.json` points the CSS entry
  at `src/styles.css`, baseColor neutral, cssVariables true, lucide icons.
- **Theming = CSS variables.** Full semantic token set (primary/secondary/accent/muted/destructive/
  success/warning with 50–950 ramps) + dedicated **sidebar** tokens + **builder-canvas** tokens
  (`--builder-background`, `--node-border-default`, …) + chart tokens + a custom animation library.
  Fonts: **Sentient** (variable, display) + **Inter** (body). `ThemeProvider`
  (`components/providers/theme-provider.tsx`) injects `--primary`, `--primary-100`, `--primary-300`,
  favicon, and `document.title` at runtime from the branding flag. **A re-skin must go THROUGH
  these tokens** or white-labeling + dark mode break.
- **i18n:** ~1,985 keys in `public/locales/en/translation.json` × **11 locales**
  (`ar de en es fr ja nl pt ru zh zh-TW`). Every user-facing string is a `t()` key; zod validation
  messages must also be existing keys (AGENTS.md rule). **Reuse the key vocabulary** (or migrate
  keys deliberately) or non-English locales break. Changing `i18n.language` remounts the whole app
  (a `key={i18n.language}` fragment in `app/app.tsx`).
- **Two independent gating axes, applied per-surface AND per-action:**
  1. **Entitlement/edition** — `platform.plan.*` booleans + `edition` (COMMUNITY/CLOUD/ENTERPRISE).
     Drives sidebar lock icons and full-page `LockedFeatureGuard` upsell overlays; `LockedAlert` and
     `RequestTrial` are the inline variants.
  2. **Permission/role** — `useAuthorization().checkAccess(Permission.*)`, `useIsPlatformAdmin()`
     (PlatformRole.ADMIN), `PermissionNeededTooltip` on disabled controls. NOTE: on COMMUNITY edition
     (or while the role is loading) `checkAccess` returns **true** (permission-open).
- **Embed mode is effectively a second UI.** `EmbeddingProvider`
  (`components/providers/embed-provider.tsx`) exposes ~18 `hide*`/`disable*` flags
  (`hideSideNav, hideFlowsPageNavbar, disableNavigationInBuilder, hideFolders, hideTables,
  hideFlowNameInBuilder, hideExportAndImportFlow, hideHomeButtonInBuilder, emitHomeButtonClickedEvent,
  homeButtonIcon, hideDuplicateFlow, hidePageHeader, useDarkBackground, fontUrl/fontFamily`, …) plus a
  `postMessage` protocol (`VENDOR_INIT`/`CLIENT_*` in `lib/embed-sdk`) and managed-token exchange.
  Every flag removes UI. The redesign must honor all of them. `HideTablesGuard` redirects table
  routes to `/automations` when `hideTables`.
- **Rebrand debt still in the UI (fix during the revamp):** hardcoded
  `cdn.activepieces.com/assets/auth-bg.webp` (sign-in bg), `sales.activepieces.com` (contact-sales),
  `activepieces.com/pricing` + `/docs`, and `hostname.includes('cloud.activepieces.com')` gating AI
  credits. Telemetry provider (`telemetry-provider.tsx`) is a **live no-op** (stubs remain; nothing is
  sent) — call sites (`capture`, `reset` on logout) still exist.

---

## 1. Route / page inventory (the navigable surface — all must remain)

### Auth / onboarding (`app/routes/auth-routes.tsx`) — forced light mode, white-labeled
`/sign-in`, `/sign-up`, `/forget-password`, `/reset-password`, `/verify-email`, `/create-platform`,
`/invitation`. Auth-adjacent (elsewhere in router): `/authenticate` (embed SSO handoff), `/redirect`
(OAuth claim + popup relay), `/mcp-authorize` (MCP OAuth consent screen).

### Public runtimes (`app/routes/public-routes.tsx`)
`/embed`, `/embed/connections`, `/templates`, `/templates/:templateId`, `/forms/:flowId` (public form
runtime), `/chats/:flowId` (public flow-chat runtime), `/404`.

### Project workspace (`app/routes/project-routes.tsx`, dual `/projects/:id/x` + bare `/x`)
`/automations` (flows+tables+folders browser), `/flows/:flowId` (**Builder**), `/runs` +
`/runs/:runId` (**Builder in readonly**), `/tables/:tableId` (data-grid editor), `/connections`,
`/variables`, `/releases` + `/releases/:releaseId`, `/settings` (redirects only; real settings are a
**modal**), `/impact` (analytics), `/leaderboard`. Plus `/chat` + `/chat/:conversationId` (**AI
assistant**, defined in `app/guards/index.tsx`).

### Platform admin (`app/routes/platform-routes.tsx`, ~21 pages, all behind `useIsPlatformAdmin`)
- **General:** projects, users, connections (read-only overview).
- **Setup:** ai (providers), mcp, branding, connections (global), pieces (blocks), templates, billing
  (+ success/error), embed.
- **Security:** sso, project-roles, api-keys, secret-managers.
- **Observability:** audit-logs, event-destinations (event streaming), chat-analytics.
- **Infrastructure:** workers, health, triggers.

> Path traps to preserve: sidebar `security/project-roles` → files at `security/project-role`;
> "Embedding" sits under Setup in the sidebar but routes to `security/embed`; "Event Streaming" is
> under Observability but routes to `infrastructure/event-destinations`.

---

## 2. Per-surface capability summary (what must survive)

### 2.1 Flow Builder — HIGHEST RISK (`app/builder/**`; `@xyflow/react` + `@dnd-kit`)
Canvas: pan (grab vs select mode, Space=temp grab), rubber-band multi-select (auto-includes children
of loops/routers/continue-on-failure), zoom (0.5–1.5), right-click context menu, minimap, fit,
**screenshot/download-as-image**, horizontal/vertical **orientation** (localStorage), notes.
Step nodes: click→settings, chevron→menu, drag-reorder into loop/branch/success-failure (rejects drop
into own descendant), loop-iteration stepper during runs. Add-step buttons (edge "+" and big "+",
which are also drop targets). **Context menu: 12+ conditional items** — replace / copy / duplicate /
skip-unskip / copy-reference / paste-after / paste-inside-loop / paste-inside-branch (+ new branch) /
paste-inside-success-failure / delete. **Keyboard shortcuts** (`app/builder/shortcuts.ts`): Esc,
Ctrl/Cmd+M (minimap), Ctrl/Cmd+C / Ctrl/Cmd+V (copy/paste steps via **OS clipboard**, cross-tab),
Ctrl/Cmd+E (skip), Shift+Delete. Step settings: **auto-save** (RHF → `applyOperation` → PromiseQueue,
debounced ~1s), inline rename, version switcher, prev/next, error-handling toggles (continue/retry on
failure); per-type panels: Loop / Code / Agent / Block / Router. Router/branch: execution type, add /
rename / duplicate / delete / drag-reorder branches, condition groups. Code: CodeMirror TS/JSON,
Dependencies tab (flag-gated), add-npm dialog. **Text-input-with-mentions** (tiptap `{{ }}` + slash
functions) + **Data Selector** overlay (Data/Variables tabs, friendly/advanced, collapsed/docked/
expanded). Test/run: test flow/step/trigger, webhook simulation, sample-data generate/save, live
websocket step progress. Runs sidebar (infinite scroll, 15s poll, retry strategies). Versions sidebar
(view / use-as-draft). Publish/draft lifecycle (publish, discard, use-as-draft, edit-vs-view-draft).
Resource lock (take-over). **Notes are editable even in readonly.** **No undo/redo exists.**
beforeunload warning while saving (non-embed).

### 2.2 Automations list (`app/routes/automations`, `features/automations/**`)
Folder/flow/table tree (accordion, virtualized, paginated). Filters (search debounced 300ms,
type/status/connections/owner/folder — **URL-synced**). Create-new menu (flow / template / table /
folder; at root or inside a folder). Row actions: open (ctrl-click→new tab), pin/favorite
(localStorage per project+user), status toggle, copy-URL (folders), rename, duplicate→new window,
move-to, export, share, delete. Bulk bar (move/export/delete; select-all cascades folder↔children;
auto-clears on any view change). Import flow/table. Distinct empty + no-results states.

### 2.3 Tables editor (`features/tables/**`, `react-data-grid`)
Field add/rename/delete — 4 types (text/number/date/static-dropdown); **no reorder or retype after
create**. Cell edit: double-click **OR type-to-edit**; text/number/date-calendar/dropdown editors;
**boundary-aware arrow-key nav** + re-focus container after commit. Rows: add (auto-scroll+select),
select, bulk-delete. Header menu: rename / import / export-template / push-to-git / download-data /
delete. Import: CSV (papaparse, append, field-mapping) / JSON (**rebuilds the whole table**); success
does `window.location.reload()`. Export: CSV, multi→ZIP (JSZip); template JSON. **Single-editor
resource lock** (heartbeat + take-over) + **agent-run row locks** (orange, non-editable). Optimistic
edits via serialized PromiseQueue ("Saving…"). **No sort / filter / pagination / undo / formulas.**
Latent (no UI today): `toggleStatus`, `exportRecords`, `setAgentRunId`.

### 2.4 Connections + Variables (`app/connections/**`, `features/connections|variables/**`)
`create-edit-connection-dialog.tsx` is a **hub reused by 5 surfaces** (project list, reconnect button,
in-builder connection-select, block-picker, embed dialog). Its prop contract
(`reconnectConnection` / `isGlobalConnection` / `externalIdComingFromSdk` / `projectId` +
`setOpen(open, connection?)`) is load-bearing — redesign it once, preserve the contract. Auth types:
OAuth2 (3 grant variants; own vs predefined app; scope multiselect; popup), custom-auth, secret-text,
basic-auth, multi-auth picker. Actions: create / edit / reconnect / rename / replace-merge (rewrites
flows) / delete / bulk-delete. Global (platform-scope) connections add project-scoping +
`preSelectForNewProjects`; **renaming a platform-scope row requires PlatformRole.ADMIN**. Secret fields
can toggle to **Secret-Manager references** (`{{connectionId::field::field}}`). Status
(Active/Missing/Error). Variables: create / edit (rotate-value) / delete / bulk / copy-reference
`{{variables['name']}}`. **Variable reveal API exists but is unused.**

### 2.5 Runs + Forms + Chat — THREE DISTINCT STACKS (do not conflate)
- **Runs list** (`features/flow-runs/**`): filters (flow / status / error-message / date [default 7d,
  auto-seeded] / archived — URL-synced); adaptive 15s poll (only while non-terminal);
  **select-all-with-exclusions** ("all except N"); bulk archive / cancel (only paused+queued) / retry
  (2 strategies + retention-window errors); failed-step dialog (internal-error branch = admin-only);
  retried-runs snackbar; queue-status chart. Single run = **builder readonly** + loop-pinning + poll.
- **Public forms** (`/forms/:flowId`): field types TOGGLE/TEXT/TEXT_AREA/FILE; required validation;
  query-param prefill; **version-gated encoding** (multipart ≥0.4.1 else base64 JSON); markdown/file
  response with auto-download.
- **Public flow-chat** (`/chats/:flowId`): stateless per-session webhook request/response; send
  text+files (attach / drag / paste); Enter-to-send; retry; image dialog; markdown + CodeMirror code
  render. No streaming, no persistence.
- **AI assistant** (`/chat`): the richest surface. Persisted conversations (new ⇧⌘O, rename, delete,
  search, date-grouped). Socket **streaming** (chunk reducer, 2-min timeout, reconnect, mid-stream
  re-entry). Stop (Esc / Square). **Tool-approval gates** (action-preview run/cancel, connection-picker,
  connections-required, project-picker, multi-question form, quick-replies). Model tiers
  (Fast/Expert/Heavy). **Voice input** (Web Speech + waveform) + **TTS** ("read aloud"). Credits banner
  (≥70% warn / exhausted error). Thinking/reasoning accordions, batch-progress cards, streaming text
  reveal.

### 2.6 Platform admin (per-page; routes in §1)
Each page: `LockedFeatureGuard` (entitlement) + permission gate. Highlights: **AI providers**
(per-provider dynamic sub-forms — Azure / Cloudflare-Gateway / Bedrock / Custom / Anthropic / Google /
OpenAI; edit-mode hides secret behind a toggle; model config for Custom + Gateway; chat-provider
selector). **Blocks** (show/hide, pin, OAuth2-app config, tags apply/create, install, sync-from-cloud).
**SSO** (Google toggle, SAML 2-step domain+IDP wizard with DNS verify, allowed-domains, email-login
toggle). **Secret managers** (HashiCorp / AWS / CyberArk / 1Password dynamic fields, scope, clear-cache,
implicit test-on-save). **API keys / signing keys** = **secret-shown-once** (copy/download then gone).
**Embed** wizard (hostname→DNS→allowed-domains→signing-keys; 4 steps cloud, 2 self-host). **Event
destinations** (event multiselect, webhook URL, **generate handler flow**, test-webhook). **Audit logs**
(filters + detail sheet). **Project roles** (12-group permission matrix None/Read/Write; create gated by
`customRolesEnabled`). **Workers / health / triggers** (read-only monitoring; tabs; month selector).
**Chat analytics** (usage / by-org / conversations tabs). **Projects / users / connections** (CRUD +
invite + bulk).

### 2.7 App shell (`app/app.tsx`, `app/components/**`, `components/providers/**`)
Provider stack (Query → RefreshAnalytics → Embedding → InitialDataGuard → FontLoader → Telemetry[noop]
→ Tooltip → i18n-remount → Theme). Sidebars (project + platform; collapsible-icon; per-item
lock/badge/notification). **⌘K global search** (flows/tables/folders/projects/static-pages + per-user
localStorage access-history). User menu → Account Settings dialog (avatar upload, **theme toggle**,
**language switch**, delete account). Help & Feedback (docs/changelog/community links — no in-app bug
widget). Platform switcher (CLOUD only). Usage-limits footer (CLOUD). Badge-celebrate (confetti). Socket
disconnect toast. **Project settings = modal** (`ProjectSettingsDialog`: General / Members / Alerts /
Blocks / Environment / MCP tabs, each independently gated by permission+flag+plan+project-type). Route
loading bar portaled into `#dashboard-content-container`.

### 2.8 Templates / Projects / Members / Alerts / Releases / Impact / Leaderboard
Templates (library search/category, use→project+folder, start-from-scratch, share-link, details preview
canvas; **OFFICIAL↔CUSTOM switch** by `manageTemplatesEnabled`; telemetry VIEW/INSTALL/EXPLORE).
Projects (TanStack DB collection; create/switch/rename/delete; teamProjectsLimit gating;
tab-visibility reconciliation reload). Members (invite [add-immediately vs link vs email by SMTP; 7-day
expiry; bulk copy/CSV], remove, revoke, change-role; owner protected; table unions members+admins+
invitations). Alerts (team add/remove email; personal toggle; platform bulk subscribe). Releases (create
from git / project / rollback; **preflight diff** with placeholder-connection warnings; git
connect/disconnect; push flow/table/everything gated to DEVELOPMENT branch + `WRITE_PROJECT_RELEASE`).
Impact (time-period/project/tab filters; refresh [24h TTL]; summary cards + trend charts; per-flow
time-saved edit → marks report outdated; CSV). Leaderboard (people/projects tabs; search; time-saved
range filter; CSV; rank badges).

> `features/agents/` is **builder AI-tooling, NOT a project-level agents CRUD surface** (naming trap).

---

## 3. The "easy-to-lose" checklist (cross-cutting; verify each in the new UI)

1. **All ~18 embed `hide*`/`disable*` flags** remove specific UI — audit each redesigned surface.
2. **Per-action permission gates + `PermissionNeededTooltip`** (not just per-route). COMMUNITY =
   permission-open.
3. **`LockedFeatureGuard` / `LockedAlert` / `RequestTrial` upsell states** on every plan-gated surface
   (specific copy, docs link, video, contact-sales).
4. **Secret-shown-once** (API keys, signing keys) + **edit-mode secret preservation** (AI providers /
   Bedrock hide credential behind Edit; omit `auth` unless changed).
5. **Provider-specific dynamic sub-forms** (each AI provider, each secret-manager, SAML 2-step, event-
   destination types) — driven by metadata, not hardcoded.
6. **Builder keyboard shortcuts + 12-item context menu + copy/paste-across-clipboard + all paste
   targets** (loop / branch / success-failure / after / after-last).
7. **Notes editable in readonly**; **tables type-to-edit + boundary arrow-nav** — do NOT blanket-disable
   editing on readonly.
8. **Resource locks** (flow + table single-editor, heartbeat, take-over) + **agent-run row locks** in
   tables.
9. **Optimistic + serialized PromiseQueue** write ordering (builder + tables "Saving…").
10. **Select-all-with-exclusions** bulk semantics in runs; **folder↔children cascade** in automations.
11. **localStorage + URL state**: canvas orientation/panning/panel prefs, favorites, automations
    filters, `?newFlow`/`?newTable`, runs filters, chat conversation id.
12. **Three chat stacks are different** (public flow-chat vs AI assistant vs builder chat-drawer) — don't
    merge.
13. **Project settings is a modal, not routes**; `/settings/*` only redirects.
14. **Runtime branding CSS-var hooks** (`--primary*`, favicon, title) + white-label on auth pages.
15. **i18n keys** for every string incl. zod messages; **11 locales**.
16. **Latent/unwired capabilities** (variable reveal, tables exportRecords/toggleStatus) — leave dormant
    for the re-skin; see §5.
17. **Reused hub components** (connection dialog ×5, builder-as-readonly-run-viewer, DataTable, project-
    settings tabs) — redesign once, preserve prop contracts.
18. **Query error-dialog convention** (`meta: { showErrorDialog: true }` on primary-data queries) per
    AGENTS.md.

---

## 4. Redesign sequencing (ordered; each phase shippable + verifiable)

Each phase keeps behavior identical and is verified against the §2/§3 checklist for its surfaces before
moving on.

- **Phase 0 — Baseline & guardrails.** Capture current UI (screenshots per route across
  editions/embed/locales), snapshot the i18n key set, turn §2/§3 into a per-surface acceptance checklist.
  Fix the rebrand debt in §0 (hardcoded activepieces.com URLs; cloud-hostname AI-credit gating).
- **Phase 1 — Design tokens & primitives.** Re-skin via `src/styles.css` `@theme` tokens + the 42
  shadcn primitives. No page logic changes. Verify: dark mode + white-label branding still resolve;
  every primitive updated.
- **Phase 2 — App shell & navigation.** Sidebars, headers, project/platform switch, ⌘K search, user
  menu, account-settings, loading bar. Verify: nav parity; embed hides everything it should; gating
  icons intact.
- **Phase 3 — Dashboard list surfaces.** Automations tree, connections, variables, runs list, templates,
  projects, members, releases, impact, leaderboard (mostly `DataTable`-driven → a shared table redesign
  covers many). Verify: filters/bulk/pagination/URL-state/permission gates.
- **Phase 4 — Platform admin.** All ~21 pages. Verify: LockedFeatureGuard states, secret-once flows,
  dynamic provider sub-forms, per-page permission gates.
- **Phase 5 — Auth / onboarding / billing / public runtimes.** Forced-light auth, white-label, error-code
  maps; billing dialogs; public forms + flow-chat. Verify: all edition/flag branches; redirect/query-
  string preservation.
- **Phase 6 — AI assistant chat.** Streaming, gates, voice/TTS, credits, model tiers. Isolate it.
  Verify: streaming/stop/re-entry; every gate card; credits states.
- **Phase 7 — Tables editor.** react-data-grid re-skin (keep the library). Verify: type-to-edit; arrow
  nav; locks; import/export; optimistic saves.
- **Phase 8 — Flow builder (LAST, riskiest).** Canvas nodes/edges/controls/context-menu/notes/data-
  selector/step-settings/panels. Verify: every shortcut, context-menu item, paste target, drag path,
  readonly rule, publish lifecycle, embed flag.

---

## 5. Deferred behavior-change checklist (NOT in this revamp — scope separately later)

> These are the "better features" surfaced during the survey. **They are explicitly out of scope for the
> re-skin** (decision: ship visual revamp with zero behavior changes first). Recorded here as the backlog
> so nothing is lost. Each is additive and must be scoped as its own effort — do NOT fold any of these
> into the re-skin phases above.

- [ ] **Undo/redo in the flow builder.** None exists today; must integrate with the
      `applyOperation` → PromiseQueue optimistic auto-save model. Today recovery = "Discard changes"
      (revert draft to published) + version-history "Use as Draft" only.
- [ ] **Undo/redo in the tables editor.** None today; same optimistic-queue integration concern.
- [ ] **Tables: sorting.** No column sort today (select column is explicitly non-sortable).
- [ ] **Tables: filtering.** No row filtering today.
- [ ] **Tables: pagination / server-side windowing.** Editor loads ALL rows (`limit: 99999999`);
      `recordsApi.list` already supports cursor/SeekPage but the editor doesn't page.
- [ ] **Tables: field reordering + change field type after creation.** Neither is possible today.
- [ ] **Tables: computed/formula fields.** No formula engine today.
- [ ] **Surface latent capability — variable value reveal.** `variablesApi.reveal` exists, no UI.
- [ ] **Surface latent capability — table record export / status toggle.** `exportRecords`,
      `toggleStatus` exist in state/utils with no in-scope UI trigger; confirm no external consumer
      before wiring or removing.
- [ ] **In-app notification center.** None today; realtime is toast-only (socket disconnect,
      badge-award confetti).
- [ ] **In-app support/bug widget.** Today "Help & Feedback" is external links only (docs / changelog /
      community).
- [ ] **Replace the import full-page reload in tables.** Import success currently does
      `window.location.reload()`; a reconcile-without-reload is a behavior improvement, not a re-skin.
- [ ] **Reduce hardcoded external branding beyond the rebrand-debt fix.** e.g. the sign-in background is a
      remote CDN image; consider a themeable/self-hosted asset.

---

## Build / verify (from `packages/web`)

- **Typecheck:** `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`).
- **Lint:** `npm run lint` (`eslint 'src/**/*.{ts,tsx}'`); repo-wide `npm run lint-dev` (auto-fix). Lint
  specific files with `NODE_OPTIONS=--max-old-space-size=8192` to avoid OOM.
- **Serve:** `npm run serve` (Vite). Cloud backend: `npx turbo run serve --filter=web -- --mode=cloud`
  (no OAuth2 connections in cloud mode — provider redirects to the cloud host).
- **Definition of Done per phase:** target surfaces visually updated + **§2/§3 capability checklist
  green for those surfaces** + no behavior change + `tsc` clean + lint clean + verified across editions
  (CE/EE/Cloud), embed mode, and at least one non-English locale + **docs screenshot refresh** (see below).

### Docs impact (user-facing Mintlify site at `docs/`)

The product docs are a Mintlify site (`docs/docs.json`, ~222 `.mdx` files: `overview`, `flows`,
`admin-guide`, `embedding`, `mcp`, `build-blocks`, `endpoints`, …). This is separate from `docs/rewrite/`
(internal build notes). Because scope is re-skin + zero behavior changes, docs **content** needs no edits
— only two exposures:

- **Screenshots (in scope, per phase).** Any doc image showing the old UI goes stale as each phase lands.
  **DoD gate:** every phase must include a **docs screenshot refresh** — re-capture the doc images for the
  surfaces that phase re-skinned, in the same edition/locale/state the original shot used, and update the
  referenced assets. A phase is not Done until its docs screenshots match the shipped UI.
- **Terminology rebrand (deferred — separate effort).** The `piece→block` / `@activepieces→@intelblocks`
  rename likely still appears across the `.mdx` files. This is a rebrand sweep, NOT part of the re-skin,
  and is deliberately deferred; do not fold it into the phases above.
