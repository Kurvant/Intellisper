# Frontend Overhaul — Capability Ledger (the "lose-nothing" acceptance gate)

> **This is the compulsory acceptance gate for the UI/UX overhaul.** Every row below is a
> capability that exists in the current frontend. The redesigned UI is NOT done for a surface
> until **every row for that surface is re-verified present** (reachable + working) in the new UI.
> A row may be *relocated, restyled, or improved* — never *removed* — unless explicitly decided
> with the user and recorded in the "Disposition" column.
>
> Columns: **ID** · **Capability** (what the user can do) · **Trigger** (button/menu/shortcut/gesture)
> · **Gate** (permission/edition/flag/embed that hides or disables it) · **New-UI location**
> (filled during the redesign) · **Verified** (☐/☑, checked when confirmed in the new UI) ·
> **Disposition** (KEEP default; or MOVED/MERGED/IMPROVED/REMOVED-with-reason).
>
> Source: the 8-cluster frontend survey (this session) + live-tree re-verification. Verify file:line
> before relying on any pointer — the tree moves.

## Ledger files (all on disk — nothing lives only in chat)

- **This file** — full tables for Runs/Forms/Chat (RUN/FRM/PCH/AIC), Tables/Connections/Variables
  (TBL/CON/VAR); grouped summaries + full-file links for the two largest clusters; §5 additions; totals.
- **[overhaul-assets/ledger-BLD-flow-builder.md](overhaul-assets/ledger-BLD-flow-builder.md)** — full 204-row
  Flow-Builder/Automations/Folders table (BLD-001..204).
- **[overhaul-assets/ledger-PLT-platform-admin.md](overhaul-assets/ledger-PLT-platform-admin.md)** — full 150-row
  Platform-Admin table (PLT-001..150).
- **[overhaul-assets/lucide-icons-in-use.txt](overhaul-assets/lucide-icons-in-use.txt)** — 256 lucide icons in use.
- Auth/Billing/Secret-Managers (AUTH/BILL/SMG) — grouped summary in this file (full per-row detail was
  extracted; the summary preserves every ID range + gate; re-extract from file:line anchors if needed).

## How to use this ledger during the overhaul

1. Before redesigning a surface, read its section here.
2. Design the new surface so every row has a home (the "New-UI location").
3. After building, walk every row and check **Verified** by actually exercising it in the running app.
4. A surface's phase is not "done" until 100% of its rows are Verified or have an explicit Disposition.

## §5 feature additions (net-new — tracked separately so they're not confused with existing caps)

These are ADDITIONS the user approved folding into the overhaul. They are new rows to build, not
existing capabilities to preserve:
- **A1** Undo/redo in the flow builder (integrate with applyOperation/PromiseQueue optimistic model).
- **A2** Undo/redo in the tables editor.
- **A3** Tables: column sorting.
- **A4** Tables: row filtering.
- **A5** Tables: pagination / server-side windowing.
- **A6** Surface latent capability: variable value reveal (`variablesApi.reveal`, exists, no UI).
- **A7** Surface latent capability: table record export / status toggle (`exportRecords`, `toggleStatus`).
- (Candidates, confirm per-surface: table field reorder / retype; in-app notification center.)

---

<!-- SURFACE SECTIONS BELOW — populated by capability-extraction pass.
Each surface gets a table. Global/cross-cutting caps (gating, embed, shortcuts, i18n) get their own
section since they span all surfaces.

NOTE: extraction tables carry columns [ID | Capability | Trigger | Gate | File:line]. During the
overhaul, add [New-UI location | Verified ☐ | Disposition] columns per surface as you build. -->

# CLUSTER: Flow Runs · Forms · Public Chat · AI Assistant Chat

## FLOW RUNS

| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| RUN-01 | Filter runs by flow name (multi-select) | "Flow name" select filter | none | runs-table/index.tsx:184 |
| RUN-02 | Filter runs by status (multi-select) | "Status" select filter | none | runs-table/index.tsx:195 |
| RUN-03 | Filter runs by error message (text) | "Error message" input → failedStepMessage | none | runs-table/index.tsx:208 |
| RUN-04 | Filter runs by created date range (default 7d) | "Created" date filter | none | runs-table/index.tsx:214 |
| RUN-05 | Auto-seed 7-day range into URL on first load | mount effect | none | runs-table/index.tsx:85 |
| RUN-06 | Toggle "Show archived" runs | checkbox → archivedAt=true | none | runs-table/index.tsx:221 |
| RUN-07 | Adaptive 15s poll while runs non-terminal | automatic refetchInterval | none | runs-table/index.tsx:141 |
| RUN-08 | Select single run row | row checkbox | none | columns.tsx:152 |
| RUN-09 | Select all rows on current page | header checkbox | none | columns.tsx:72 |
| RUN-10 | "Select shown" (visible page only) | chevron dropdown → Select shown | none | columns.tsx:112 |
| RUN-11 | "Select all" (whole result set) | chevron dropdown → Select all | none | columns.tsx:129 |
| RUN-12 | Exclude rows in select-all mode ("all except N") | uncheck row in select-all | none | columns.tsx:166 |
| RUN-13 | Bulk archive selected runs | Archive bulk button | WRITE_RUN | index.tsx:278 |
| RUN-14 | Bulk cancel (only PAUSED+QUEUED; else disabled tooltip) | Cancel bulk button | WRITE_RUN + all paused/queued | index.tsx:332 |
| RUN-15 | Bulk retry on latest version | Retry dropdown → latest version | WRITE_RUN | index.tsx:446 |
| RUN-16 | Bulk retry from failed step (all-failed only) | Retry dropdown → from failed step | WRITE_RUN + all failed | index.tsx:483 |
| RUN-17 | Partial-retry failure toast w/ "More" | auto toast on partial failure | none | index.tsx:244 |
| RUN-18 | Failed-retry details dialog | toast "More" → dialog | none | failed-retry-runs-dialog.tsx:30 |
| RUN-19 | Retention-window explanation for out-of-retention retry | in failed-retry dialog | flag EXECUTION_DATA_RETENTION_DAYS | failed-retry-runs-dialog.tsx:36 |
| RUN-20 | "Runs retried" snackbar w/ View | auto snackbar after retry | none | retried-runs-snackbar.tsx:11 |
| RUN-21 | Jump to filtered "retried runs" view | snackbar View / onSuccess redirect | none | retried-runs-snackbar.tsx:33 |
| RUN-22 | Clear "Viewing retried runs" filter chip | filter chip (X) | none | index.tsx:564 |
| RUN-23 | Open failed-step error dialog (JSON + step icon) | "View error" in Failure column | none | columns.tsx:346 |
| RUN-24 | Open internal-error dialog (message + source) | "View error" (Internal error) | Platform admin | columns.tsx:321 |
| RUN-25 | Navigate to run detail from failed-step dialog | "Go to run" button | none | failed-step-dialog.tsx:112 |
| RUN-26 | Queue Status donut/breakdown popover (7d) | "Queue Status" button | none | runs-status-chart.tsx:101 |
| RUN-27 | Open run detail on row click (same tab) | row click | none | index.tsx:548 |
| RUN-28 | Open run detail in new window | ctrl/cmd/middle-click row | none | index.tsx:549 |
| RUN-29 | View run duration + wait-time tooltip | hover Duration cell | none | columns.tsx:265 |
| RUN-30 | View read-only run in builder (15s refetch) | navigate /runs/:runId | none | routes/runs/id/index.tsx:12 |

## FORMS (public)

| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| FRM-01 | Load published/draft form by flowId | route /forms/:flowId (useDraft) | form exists (else 404) | routes/forms/index.tsx:10 |
| FRM-02 | Enter TEXT field | text input | none | ap-form.tsx:256 |
| FRM-03 | Enter TEXT_AREA field | textarea | none | ap-form.tsx:245 |
| FRM-04 | Toggle boolean (TOGGLE) field | checkbox | none | ap-form.tsx:214 |
| FRM-05 | Upload FILE field | file input | none | ap-form.tsx:267 |
| FRM-06 | Expand long field description ("Read more") | ReadMoreDescription | none | ap-form.tsx:230 |
| FRM-07 | Prefill fields from query params (lowercase match) | automatic on load | none | ap-form.tsx:108 |
| FRM-08 | Submit form (zod required-field validation) | Submit button | none | ap-form.tsx:146 |
| FRM-09 | Version-gated encoding (FormData ≥0.4.1 vs base64 JSON) | automatic on submit | version gte 0.4.1 | human-input-api.tsx:89 |
| FRM-10 | Sync vs async webhook routing (waitForResponse/mode) | automatic suffix | draft + waitForResponse | human-input-api.tsx:31 |
| FRM-11 | View markdown response inline after submit | on MARKDOWN result | none | ap-form.tsx:154 |
| FRM-12 | Auto-download returned file(s) | on FILE/MARKDOWN-with-files | none | ap-form.tsx:92 |
| FRM-13 | Success/error toasts (404 vs generic) | on submit result | none | ap-form.tsx:168 |
| FRM-14 | "Powered by" badge | flag render | flag SHOW_POWERED_BY_IN_FORM | ap-form.tsx:138 |

## PUBLIC FLOW CHAT

| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PCH-01 | Load chat UI (published or draft/test) | route /chat/:flowId (useDraft) | chat exists (else ChatNotFound) | routes/chat/index.tsx:14 |
| PCH-02 | Bot intro/welcome + typing animation | on empty chat | showWelcomeMessage | chat-intro.tsx:9 |
| PCH-03 | Type message (Enter send, Shift+Enter newline) | textarea + Enter | none | chat-input/index.tsx:71 |
| PCH-04 | Attach files via paperclip (multiple) | paperclip file picker | none | chat-input/index.tsx:139 |
| PCH-05 | Drag-and-drop files onto input | drop on wrapper | none | chat-input/index.tsx:82 |
| PCH-06 | Paste files from clipboard | paste in textarea | none | chat-input/index.tsx:128 |
| PCH-07 | Preview attached files + remove | file preview chip X | none | file-input-preview.tsx:11 |
| PCH-08 | Send message (optimistic bubble w/ object URLs) | Send / Enter | none | flow-chat.tsx:102 |
| PCH-09 | Session-scoped chat via nanoid | automatic | none | routes/chat/index.tsx:24 |
| PCH-10 | Draft/test/locked webhook mode routing | automatic per mode | draft/test-step | flow-chat.tsx:134 |
| PCH-11 | Bot markdown text w/ syntax-highlighted code | assistant render | none | text-message.tsx:24 |
| PCH-12 | Copy bot message | copy button | none | text-message.tsx:106 |
| PCH-13 | Copy individual code block | "Copy Code" | none | text-message.tsx:85 |
| PCH-14 | Bot image attachment + hover-download | image message | none | image-message.tsx:11 |
| PCH-15 | Full-size image dialog (Esc/X, download) | click image | none | image-dialog.tsx:12 |
| PCH-16 | Download bot/file attachment | click file message | none | file-message.tsx:11 |
| PCH-17 | Error bubble w/ contextual message | on send error | none | error-bubble.tsx:12 |
| PCH-18 | Retry last message | error-bubble retry | none | error-bubble.tsx:80 |
| PCH-19 | "Bot is typing" loading bubble | while sending | none | chat-message-list/index.tsx:117 |
| PCH-20 | Auto-scroll to newest | on messages change | none | flow-chat.tsx:77 |

## AI ASSISTANT CHAT

| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| AIC-01 | "Setup required" state when no chat AI provider | automatic | provider w/ enabledForChat | ai-chat-box.tsx:43 |
| AIC-02 | Start new chat | "New chat" button | none | conversation-list.tsx:178 |
| AIC-03 | New chat via ⇧⌘O / Ctrl+Shift+O | keyboard | none | index.tsx:154 |
| AIC-04 | Search conversations (>5) | search input | >5 conversations | conversation-list.tsx:191 |
| AIC-05 | Browse conversations grouped Today/Yesterday/Older | group headers | none | conversation-list.tsx:73 |
| AIC-06 | Select a conversation | conversation button | none | conversation-list.tsx:97 |
| AIC-07 | Delete conversation from list (hover trash) | trash icon / Enter | none | conversation-list.tsx:144 |
| AIC-08 | Rename conversation (inline, Enter/Esc) | header ⋯ → Rename | none | index.tsx:85 |
| AIC-09 | Delete active conversation | header ⋯ → Delete | none | index.tsx:115 |
| AIC-10 | Animated typewriter conversation title | automatic | none | index.tsx:217 |
| AIC-11 | Type message (auto-focus) | prompt textarea | none | chat-input.tsx:169 |
| AIC-12 | Attach files (paperclip) | paperclip | none | chat-input.tsx:177 |
| AIC-13 | Drag-and-drop files (overlay) | drop on FileUpload | none | chat-input.tsx:113 |
| AIC-14 | Remove attached file chip | chip X | none | chat-input.tsx:145 |
| AIC-15 | Send message (10MB/file + MIME check) | Send/Enter | ≤10MB + allowed MIME | chat-input.tsx:96 |
| AIC-16 | Stream response (thinking/reasoning/text + cursor) | automatic after send | none | ai-chat-box.tsx:207 |
| AIC-17 | Stop streaming via Stop button | Stop (Square) | during streaming | chat-input.tsx:188 |
| AIC-18 | Stop streaming via Esc (ignores inputs/dialogs) | Escape | streaming, not in field | ai-chat-box.tsx:99 |
| AIC-19 | "Response stopped" indicator | after cancel | none | ai-chat-box.tsx:228 |
| AIC-20 | Retry / regenerate last message | error Retry / Regenerate | none | ai-chat-box.tsx:132 |
| AIC-21 | Retry when agent gave no summary | inline refresh | none | assistant-message.tsx:404 |
| AIC-22 | Error banner w/ retry | on error | none | ai-chat-box.tsx:235 |
| AIC-23 | Voice input (start/stop, tones, interim transcript) | Mic button | SpeechRecognition supported | chat-input.tsx:222 |
| AIC-24 | Cancel voice recording via Esc | Escape while recording | recording | chat-input.tsx:81 |
| AIC-25 | Read assistant message aloud (TTS) / stop | Read aloud / Stop | speechSynthesis supported | assistant-message.tsx:439 |
| AIC-26 | Copy assistant message | Copy action | not streaming, has content | assistant-message.tsx:434 |
| AIC-27 | Copy user message | Copy on user bubble | none | user-message.tsx:79 |
| AIC-28 | Select model tier (Fast/Expert/Heavy) w/ kbd nav | model selector popover | none | chat-model-selector.tsx:48 |
| AIC-29 | Persist model change to conversation | model change | none | use-chat.ts:658 |
| AIC-30 | Approve action-preview (Run) | "Run" button | pending action-preview gate | action-preview-card.tsx:85 |
| AIC-31 | Reject action-preview (Cancel) | "Cancel" button | pending action-preview gate | action-preview-card.tsx:90 |
| AIC-32 | Toggle raw JSON / batch samples in preview | "Raw JSON" toggle | none | action-preview-card.tsx:79 |
| AIC-33 | Answer connections-required card | Connect/Switch/Continue | ib_show_connection_required | connections-required-card.tsx:140 |
| AIC-34 | Pick a connection (Use/Connect/Reconnect&Use) | picker card buttons | ib_show_connection_picker | connection-picker-card.tsx:246 |
| AIC-35 | Create/reconnect connection via dialog from card | Connect → dialog | none | connection-picker-card.tsx:359 |
| AIC-36 | Pick a project (chips + searchable) | project picker card | ib_show_project_picker | project-picker-card.tsx:29 |
| AIC-37 | Answer multi-question form (choice/text, custom, prev/next/skip) | multi-question form | ib_show_questions / active form | multi-question-form.tsx:21 |
| AIC-38 | Skip questions form | X / dismiss | none | chat-bottom-bar.tsx:97 |
| AIC-39 | Send a quick-reply chip | quick-reply button | not streaming, replies present | quick-replies.tsx:3 |
| AIC-40 | Expand/collapse thinking (activity) accordion | thinking header | expandable | activity-accordion.tsx:58 |
| AIC-41 | View action-receipt card + show/hide output JSON | "Show output" toggle | receipt present | action-receipt-card.tsx:14 |
| AIC-42 | View batch-progress card | automatic during batch | none | assistant-message.tsx:384 |
| AIC-43 | Credits warning banner (dismissible) | credits warning | warning present | credits-banner.tsx:10 |
| AIC-44 | Credits-exhausted banner (non-dismissible) | credits exhausted | AI_CREDIT_LIMIT_EXCEEDED | credits-banner.tsx:23 |
| AIC-45 | Open billing/usage from credits banner | "Show Usage" link | Platform admin | credits-banner.tsx:50 |
| AIC-46 | Empty-state suggestion / flow card → prefill+send | suggestion/flow card | not incognito; flow cards if no convos | chat-empty-state.tsx:132 |
| AIC-47 | Mid-stream re-entry (resume streaming/gate) | select STREAMING conversation | none | use-chat.ts:519 |
| AIC-48 | Adaptive 5s agent-reply polling | automatic | isPollingForAgentReply | use-chat.ts:608 |
| AIC-49 | Scroll-to-bottom button | scroll button | scrolled up | ai-chat-box.tsx:258 |

# CLUSTER: Tables editor · Connections · Variables

## TABLES editor

| ID | Capability | Trigger | Gate | File:line |
|---|---|---|---|---|
| TBL-01 | Edit cell by typing (type-to-edit, seeds value) | type on focused cell | WRITE_TABLE & not locked | editable-cell.tsx:75 |
| TBL-02 | Edit cell via double-click | double-click cell | WRITE_TABLE & not locked | editable-cell.tsx:141 |
| TBL-03 | Enter edit via click-select then type | click then type | WRITE_TABLE & not locked | editable-cell.tsx:134 |
| TBL-04 | Boundary arrow-key nav suppression (keeps focus in grid) | arrow keys at edges | none | editable-cell.tsx:88 |
| TBL-05 | Re-focus container after commit (kbd nav continues) | commit (blur/Enter) | none | cell-context.tsx:52 |
| TBL-06 | Initial cell focus on mount when selected | auto | none | editable-cell.tsx:42 |
| TBL-07 | Deselect cell by clicking outside | click outside | none | routes/tables/id/index.tsx:90 |
| TBL-08 | Commit text edit (Enter; Shift+Enter newline; Esc cancel; blur commit) | textarea keys/blur | WRITE_TABLE | text-editor.tsx:35 |
| TBL-09 | Edit number cell (Enter/Esc/blur) | number input | WRITE_TABLE | number-editor.tsx:38 |
| TBL-10 | Edit date cell (calendar or typed) | date input + popover | WRITE_TABLE | date-editor.tsx:30 |
| TBL-11 | Edit dropdown cell (searchable, empty option) | dropdown select | WRITE_TABLE | dropdown-editor.tsx:36 |
| TBL-12 | Create empty record + auto-scroll + select first cell | "+" summary-row / footer | canEdit & records<MAX flag | routes/tables/id/index.tsx:72 |
| TBL-13 | Optimistic record create via PromiseQueue | auto | none | ap-tables-server-state.ts:58 |
| TBL-14 | Optimistic cell/record update (order-corrected) | cell commit | none | cell-context.tsx:60 |
| TBL-15 | "Saving..." spinner while queue drains | auto (isSaving) | none | ap-table-header.tsx:221 |
| TBL-16 | Select single row (checkbox; index shown otherwise) | row checkbox | none | select-column.tsx:30 |
| TBL-17 | Select all rows | header checkbox | none | select-column.tsx:8 |
| TBL-18 | Bulk-delete records (confirmation, count) | "Delete Records (n)" | WRITE_TABLE & not locked | ap-table-header.tsx:240 |
| TBL-19 | Agent-run row lock (locked styling, non-editable) | auto (agentRunId rows) | none | table-columns.tsx:62 |
| TBL-20 | Open agent-run detail by clicking locked row | click locked cell/row | none | table-columns.tsx:61 |
| TBL-21 | Create field (Text/Number/Date/Dropdown; unique-name) | "+" add-field → popup | canEdit & fields<MAX | new-field-popup.tsx:100 |
| TBL-22 | Rename field (popover, unique-name) | field ▾ → Rename | WRITE_TABLE & not locked | rename-field-popovercontent.tsx:63 |
| TBL-23 | Delete field (confirmation) | field ▾ → Delete | WRITE_TABLE & not locked | field-action-menu-item-renderer.tsx:33 |
| TBL-24 | Rename table inline (editable breadcrumb) | click name / ▾ Rename | WRITE_TABLE & not locked | ap-table-header.tsx:119 |
| TBL-25 | Delete table (confirmation, navigates back) | table ▾ → Delete | WRITE_TABLE & not locked | ap-table-header.tsx:186 |
| TBL-26 | Import JSON (rebuilds whole table) | table ▾ → Import → JSON | WRITE_TABLE & not locked | import-table-dialog.tsx:153 |
| TBL-27 | Import CSV (field-mapping, append, editor-only) | Import → CSV | WRITE_TABLE; editor-only | import-table-dialog.tsx:136 |
| TBL-28 | Map CSV columns to fields ("Ignored" option) | field-mapping control | none | fields-mapping.tsx:42 |
| TBL-29 | Import new table from JSON template (single/multi) | Import when no tableId | WRITE_TABLE | import-table-dialog.tsx:153 |
| TBL-30 | Warn JSON-into-existing fully replaces table | auto | none | import-table-dialog.tsx:271 |
| TBL-31 | Copy import server-error to clipboard | Copy button on error | none | import-table-dialog.tsx:437 |
| TBL-32 | Export Template (download table JSON) | table ▾ → Export Template | none | ap-table-header.tsx:93 |
| TBL-33 | Download Data (CSV single / ZIP multi) | "Download Data" | none | ap-table-header.tsx:102 |
| TBL-34 | Push table to Git | table ▾ → Push to Git | WRITE_PROJECT_RELEASE + showPushToGit | ap-table-header.tsx:161 |
| TBL-35 | View active users on table (presence) | auto in header | none | ap-table-header.tsx:239 |
| TBL-36 | Resource lock on open + 30s heartbeat + release on unmount | auto | none | use-resource-lock.ts:46 |
| TBL-37 | "X is editing" banner when locked; editing disabled | auto (lockedBy) | none | ap-table-header.tsx:227 |
| TBL-38 | Take Over lock (force + reload) | "Take Over" button | none | use-resource-lock.ts:84 |
| TBL-39 | Navigate back to automations | breadcrumb / back | none | routes/tables/id/index.tsx:109 |
| TBL-40 | Footer: record/field counts + % of MAX + selection summary | auto footer | none | ap-table-footer.tsx:27 |
| TBL-41 | Empty/error "Table not available" + link | auto on load error | none | ap-table-state-provider.tsx:104 |
| TBL-42 | (List) table actions menu: rename/import/export/push/download/delete | ⋮ menu | WRITE_TABLE / WRITE_PROJECT_RELEASE | ap-table-actions-menu.tsx:82 |

## CONNECTIONS

| ID | Capability | Trigger | Gate | File:line |
|---|---|---|---|---|
| CON-01 | Open New Connection block-picker (searchable; auth-only blocks) | "New Connection" | WRITE_APP_CONNECTION | new-connection-dialog.tsx:42 |
| CON-02 | Create Secret-Text connection | pick block → save | WRITE_APP_CONNECTION | secret-text-connection-settings.tsx |
| CON-03 | Create Basic-Auth connection | pick block → save | WRITE_APP_CONNECTION | basic-secret-connection-settings.tsx |
| CON-04 | Create Custom-Auth connection (generic props) | pick block → save | WRITE_APP_CONNECTION | custom-auth-connection-settings.tsx |
| CON-05 | Create OAuth2 — Auth Code grant (Connect popup, PKCE, disconnect) | OAuth2 → Connect | WRITE_APP_CONNECTION | oauth2-connection-settings.tsx:234 |
| CON-06 | Create OAuth2 — Client Credentials grant (no code step) | client-creds option | WRITE_APP_CONNECTION | multi-auth-list.tsx:153 |
| CON-07 | Create OAuth2 w/ predefined app ("Recommended") | multi-auth Recommended | WRITE_APP_CONNECTION; predefined app | multi-auth-list.tsx:118 |
| CON-08 | Create OAuth2 w/ own Client ID/Secret + Redirect URL | multi-auth Custom App | WRITE_APP_CONNECTION | oauth2-connection-settings.tsx:81 |
| CON-09 | Edit OAuth2 scopes (multi-select, Select All) | permissions selector | scope.length>1 | oauth2-connection-settings.tsx:147 |
| CON-10 | Switch auth method ("Try another method") | button → radio → Next | multiple auth / both grants | multi-auth-list.tsx:65 |
| CON-11 | Set connection display name | name field | hidden if SDK externalId | create-edit-connection-dialog.tsx:161 |
| CON-12 | Toggle secret input → Secret-Manager reference | KeyRound toggle | secretManagersEnabled & SM conns exist | secret-input.tsx:38 |
| CON-13 | Reconnect connection (reuses externalId/scope) | Cable icon | WRITE_APP_CONNECTION / ADMIN(platform) | reconnect-button-dialog.tsx:24 |
| CON-14 | Rename project-scope connection (unique) | Pencil (project) | WRITE_APP_CONNECTION | rename-connection-dialog.tsx |
| CON-15 | Edit global connection (name, projects, include-default) | Pencil (platform) | WRITE_APP_CONNECTION / ADMIN | edit-global-connection-dialog.tsx:48 |
| CON-16 | Platform-admin-only rename/edit gating for global in project list | row disabled unless admin | PlatformRole.ADMIN | routes/connections/index.tsx:286 |
| CON-17 | Replace/merge connection (rewrites flows, 2-step) | "Replace" toolbar | WRITE_APP_CONNECTION | replace-connections-dialog.tsx:50 |
| CON-18 | Navigate to affected flow from replace list | flow link | none | replace-connections-dialog.tsx:414 |
| CON-19 | Bulk-delete connections | "Delete (n)" | WRITE_APP_CONNECTION | routes/connections/index.tsx:331 |
| CON-20 | Navigate to flows filtered by connection | click flow count | none | routes/connections/index.tsx:257 |
| CON-21 | Copy connection External ID | click name | none | routes/connections/index.tsx:181 |
| CON-22 | Filter connections (Status/Block/Name/owner) | DataTable filters | none | routes/connections/index.tsx:129 |
| CON-23 | Owner filter → project members only in embed | auto | embed mode | app-connections-hooks.ts:341 |
| CON-24 | Empty state "No connections found" | auto | none | routes/connections/index.tsx:425 |
| CON-25 | Create global connection (projects + include-default + extId) | Setup New Connection | WRITE_APP_CONNECTION; ≥1 project | platform/setup/connections/index.tsx:291 |
| CON-26 | Bulk-delete global connections | Setup Delete (n) | WRITE_APP_CONNECTION | platform/setup/connections/index.tsx:242 |
| CON-27 | Reconnect/edit global from setup | Pencil/Cable | always | platform/setup/connections/index.tsx:184 |
| CON-28 | Global Connections locked behind plan (upsell) | auto | globalConnectionsEnabled | platform/setup/connections/index.tsx:311 |
| CON-29 | Filter global connections (Search/Status) | Setup filters | none | platform/setup/connections/index.tsx:57 |
| CON-30 | View platform-wide connections read-only (Scope/Owner/Project) | Platform connections page | platform admin | platform/connections/index.tsx:45 |
| CON-31 | Connection dialog blocks close-on-outside-click | onInteractOutside prevent | none | create-edit-connection-dialog.tsx:369 |
| CON-32 | Embed/SDK connect permission-denied inline error | auto | embed SDK | app-connections-hooks.ts:155 |
| CON-33 | Server-error mapping (OAuth/SM/validation) inline | auto | none | app-connections-hooks.ts:128 |

## VARIABLES

| ID | Capability | Trigger | Gate | File:line |
|---|---|---|---|---|
| VAR-01 | Create variable (name regex, value required, show/hide) | "New variable" → dialog | WRITE_VARIABLE | variable-dialog.tsx:95 |
| VAR-02 | Edit variable — rotate value (name locked) | Row ⋮ → Edit → Rotate value | WRITE_VARIABLE | variable-dialog.tsx:80 |
| VAR-03 | Toggle value visibility in dialog | Eye button | none | variable-dialog.tsx:181 |
| VAR-04 | Delete single variable (confirmation) | Row ⋮ → Delete | WRITE_VARIABLE | routes/variables/index.tsx:197 |
| VAR-05 | Bulk-delete variables (confirmation, count) | "Delete (n)" | WRITE_VARIABLE | routes/variables/index.tsx:217 |
| VAR-06 | Copy variable reference `{{variables['name']}}` | Row ⋮ → Copy reference | none | routes/variables/index.tsx:43 |
| VAR-07 | Filter variables by Name (+ owner) | DataTable filters | none | routes/variables/index.tsx:110 |
| VAR-08 | Duplicate-name error on create | auto (VALIDATION) | none | variable-dialog.tsx:114 |
| VAR-09 | Empty state "No variables yet" | auto | none | routes/variables/index.tsx:275 |
| VAR-10 | ⚠️LATENT: reveal variable value API (no UI) → §5-A6 candidate | none | none | features/variables/api/variables.ts:39 |

# CLUSTER: Platform Admin (~21 pages) — PLT-001..150

> **FULL 150-row table: [overhaul-assets/ledger-PLT-platform-admin.md](overhaul-assets/ledger-PLT-platform-admin.md)**
> (every row preserved on disk). Key IDs by page below (Gate column notes the LockedFeatureGuard plan flag).

- **Projects** PLT-001..009 (view/filter Name+Type, open=switch, create, edit, bulk-delete[blocks enabled-flows/active], bulk alert-subscribe). Gate: LockedFeatureGuard PROJECTS (teamProjectsLimit).
- **Users** PLT-010..015 (view users+invitations, invite, edit role+extId, activate/deactivate[not Admin], delete user, delete invitation). USERS guard always open.
- **Platform Connections (read)** PLT-016..023 (view all-project connections; filter Name/Status/Block/Project/Owner[truncated]; copy extId; project link).
- **Global Connections (setup)** PLT-024..030 (view+Default tag, filter Search/Status, create, edit[name/projects/preSelect], reconnect, bulk-delete). Gate: GLOBAL_CONNECTIONS.
- **AI Providers** PLT-031..045 (list, chat-provider select, chat-analytics link, enable/edit/delete provider, save[edit preserves secrets]; per-provider sub-forms: Anthropic/Google/OpenAI key[shown-once], Azure[+resource+version], Cloudflare-Gateway[+account/gateway/vertex+models], Bedrock[AWS creds+region], Custom[baseURL/header/custom-headers/models]; add/edit/remove model). Gate: UNIVERSAL_AI (ADMIN); write=aiProvidersEnabled.
- **MCP** PLT-046..049 (view server URL+JSON config, copy URL, copy JSON, enable/disable internal tools).
- **Blocks** PLT-050..061 (view+tags, filter, request-trial, sync-from-cloud[OFFICIAL_AUTO], install, show/hide, pin/unpin, configure/delete OAuth2 app, bulk apply tags, create tag, delete tag). Gate: manageBlocksEnabled (LockedAlert).
- **Templates** PLT-062..066 (view, create[name/summary/desc/blog/json], edit, select, bulk-delete). Gate: TEMPLATES.
- **Branding** PLT-067..073 (edit name, upload logo/icon/favicon, primary color, save[reloads]). Gate: BRANDING.
- **Billing** PLT-074..079 (view sub-info, chat-analytics link, portal, active-flow addon, AI credit usage, license key). Gate: BILLING (edition≠COMMUNITY).
- **API Keys** PLT-080..082 (view, create[shown-once secret], revoke). Gate: API.
- **Secret Managers** PLT-083..091 (view, create[provider/name/scope/project], sub-forms HashiCorp/AWS/CyberArk/1Password, edit, clear-cache, delete). Gate: SECRET_MANAGERS.
- **Audit Logs** PLT-092..099 (view, filter Action/PerformedBy/Project/Created, detail sheet[IP+payload], project link, chat-analytics link). Gate: AUDIT_LOGS.
- **Project Roles** PLT-100..107 (view, create[12-group None/Read/Write matrix; gated by customRolesEnabled], set-perm, edit custom, view default[read-only], delete custom, view assigned users, project link). Gate: TEAM (projectRolesEnabled).
- **Embed** PLT-108..115 (stepper cloud=4/self-host=2 steps: hostname save/update[confirm], DNS verify[copy records], allowed-domains[TagInput], create signing-key[shown-once], delete signing-key). Gate: SIGNING_KEYS.
- **SSO** PLT-116..125 (view, allowed-domains[array+enforce], Google toggle, Email toggle, SAML 2-step wizard[domain save/verify-DNS/next → IDP metadata+cert save/back], disable SAML). Gate: SSO.
- **Workers** PLT-126..129 (view machines CPU/RAM/Disk/status, upgrade-dedicated[cloud], configs popover, sandboxes popover). Read-only.
- **Health** PLT-130..135 (tabs System/Runs/Queue[URL-persist], month select, system checks+changelog, daily strip→runs, runs metrics+chart+internal-errors, queue+stuck-jobs). Read-only.
- **Triggers** PLT-136 (per-block status/14D runs/last-results/24H-7D-14D %). Read-only.
- **Event Destinations** PLT-137..143 (view internal/external+event badges, create[events+URL], generate-handler-flow, test-webhook, edit, delete, open handler flow). Gate: EVENT_DESTINATIONS.
- **Chat Analytics** PLT-144..150 (stat cards, date range, rollout funnel, Usage/ByOrg/Conversations tabs, usage group-by, by-org table, conversation detail sheet). No guard (server-gated).

# CLUSTER: Auth · Billing · Secret-Managers (frontend) — AUTH/BILL/SMG

> Full table in transcript. Key groups (each an ID range; Gate = edition/flag):
- **Sign-in** AUTH-001..013 (submit, pwd show/hide, forgot-link[≠COMMUNITY], no-user→signup redirect, no-project→create-platform, 6 error-code messages, zod validation, email-form gated EMAIL_AUTH_ENABLED).
- **Sign-up** AUTH-020..033 (submit[lowercase/trackEvents], prefill ?email, pwd show/hide, strength bolt, requirements popover, newsletter[edition-gated], check-email, create-platform redirect, 5 error messages, field validation).
- **Auth template** AUTH-040..046 (toggle signin/signup preserving query, Terms[CLOUD+url], Privacy[CLOUD+url], footer hide, "or" separator, force-light-mode, auto-redirect-if-authed).
- **Third-party/SSO** AUTH-050..054 (Google, SAML cloud[email-discovery], SAML self-host[direct], error toast, preserve ?from in state).
- **SAML discovery** AUTH-060..064 (submit→discover platformId, no-provider error, generic error, back, disabled-until-valid).
- **Forgot/Reset** AUTH-070..078 (send reset OTP, check-inbox, neutral disclosure, back, submit new pwd, requirements popover, success→signin, expired error, read otp/identityId).
- **Verify email** AUTH-090..096 (auto-verify, PartnerStack report, verified→redirect 5s, expired[410], error toast, missing-params redirect, loading).
- **OTP/resend** AUTH-100..103 (resend, 2 success toasts, context copy).
- **Create platform** AUTH-110..115 (submit[trim], no-token redirect, not-onboarding redirect, 2 errors, validation maxLen100+SAFE_STRING).
- **Accept invitation** AUTH-120..124 (auto-accept ?token, not-registered→signup, registered→signin, invalid-token, 500 toast).
- **Authenticate/redirect/MCP-authorize** AUTH-130..146 (consume ?response, claim OAuth code, create-platform redirect, redirect ?from, invitation-only toast, error→signin, popup-relay postMessage, fallback; MCP: decode JWT, 404-guard, signin-preserve-return, project-picker[searchable/debounced], type filter, authorize→redirectUrl, deny, connected screen, error).
- **Billing subscription/portal** BILL-001..004 (LockedFeatureGuard, sub-info, Stripe portal new-tab, loading/error).
- **Active-flows add-on** BILL-010..021 (usage+>80% warn, manage[STANDARD], slider 10-100+cost, upgrade purchase, downgrade confirm, same-disabled, create-vs-update branch, checkout new-tab, navigate+toast, error toast, error-page redirect, start-free-sub).
- **AI credits** BILL-030..038 (show remaining/used, purchase dialog[CAN_BUY], slider 1k-500k→checkout, auto-topup toggle, edit config, 3-slider config, save→checkout+toast, error toast, summary text).
- **License key** BILL-050..054 (activate/update, submit[disabled-if-empty], status badge[expired/soon<7d/active], View Plans link, feature grid 20 features→Check/Lock).
- **Checkout result** BILL-060..065 (success action-copy via ?action, auto-redirect 5s, go-dashboard/view-billing, error page+remediation, error auto-redirect+retry, contact-sales/request-trial).
- **Secret managers (frontend)** SMG-001..017 (LockedFeatureGuard, list[name/scope/status], status cell, new-dialog, edit, clear-cache, delete[warn], provider select[resets config], name, scope select, project selector[if Project], provider dynamic fields[HashiCorp/AWS/CyberArk/1Password], save[create/update+implicit-test], success toasts, 2 error messages, delete/update/clearcache toasts).

# CLUSTER: Flow Builder + Automations list + Folders — BLD-001..204 (LARGEST/RISKIEST)

> **FULL 204-row table: [overhaul-assets/ledger-BLD-flow-builder.md](overhaul-assets/ledger-BLD-flow-builder.md)**
> (every row preserved on disk). Grouped summary below. Highest-risk surface (canvas UX rebuild). Key groups:
- **Canvas** BLD-001..018 (pan grab/select+Shift, rubber-band select, scroll-pan, deselect, grab/select mode toggle[persist], zoom in/out, fit, screenshot, orientation toggle[persist], minimap toggle[Ctrl+M]+pan/zoom, add-note[hidden readonly], translate-extent bound, zoom clamp 0.5-1.5, auto-recenter on resize, selection-chevron button).
- **Step node** BLD-019..030 (select→settings, right-click menu, chevron menu[hidden readonly], drag-move[not trigger/readonly], replace block, configure empty trigger, add-action edge "+"[hidden readonly], drop-to-move, big-add branch/loop child, loop-iteration stepper up/down/type[run only, clamped]).
- **Context menu** BLD-031..044 (replace, copy[Ctrl+C], duplicate, skip/unskip[Ctrl+E], copy-reference, paste-after-last, paste-inside-loop, paste-after, paste-inside-branch, paste-into-new-branch, paste-into-success, paste-into-failure, delete[Shift+Del], empty-clipboard toast). ALL gated single/multi-select + STEP/CANVAS type + not-readonly + trigger-exclusion.
- **Step settings** BLD-045..058 (edit form[autosave], close, rename inline, prev/next step, version switcher, error-handler toggle, retry toggle, split/drawer toggle[persist], auto-collapse<700px, resize sidebar, connection select, create connection[WRITE_APP_CONNECTION], reconnect).
- **Router/branch** BLD-059..073 (execution type, add branch, select branch, rename branch, duplicate branch, delete branch[>2 only], reorder branches[drag], condition first-value/operator/second-value, case-sensitive toggle, remove condition, add-AND, add-OR-group, return-to-router crumb).
- **Loop** BLD-074 (items array mention input).
- **Code** BLD-075..078 (edit inputs dict, edit source[CodeMirror], Code/Deps tab[flag ALLOW_NPM_PACKAGES], add npm package[flag]).
- **Data selector** BLD-079..086 (auto-show on mention focus, search, friendly/advanced, Data/Variables tab, expand/dock/minimize, insert reference).
- **Runs sidebar** BLD-087..093 (open[READ_FLOW], close, load-more, open run, retry latest, retry from-failed, 15s poll).
- **Live run** BLD-094..098 (auto-follow, resume follow, jump-to-error, poll prod run 5s, manual-select marks manual).
- **Versions** BLD-099..104 (open, close, view version[readonly], use-as-draft[overwrite], use-viewed-as-draft, return-to-draft).
- **Publish** BLD-105..118 (publish[disabled if invalid], discard changes, status toggle[UPDATE_FLOW_STATUS], rename flow inline, auto-rename ?newFlow, flow-actions menu, back-to-automations[embed disableNav], Support[SHOW_COMMUNITY], Test/Run flow, Open Chat, jump-incomplete, edit/view-draft[Esc/Ctrl+D], take-over lock, beforeunload warning[not embed]).
- **Test step** BLD-119..124 (test step[Ctrl+G], retest, test trigger, retest trigger, show sample/output, configure-first toast).
- **Notes** BLD-125..133 (create by placing, edit[dblclick, NOT readonly], read-only-viewable in readonly, change color, delete, resize 150-600, move[drag], Esc-blur, markdown tools).
- **Keyboard shortcuts** BLD-134..140 (copy Ctrl+C, paste Ctrl+V, delete Shift+Del, skip Ctrl+E, minimap Ctrl+M, exit-drag Esc, edit-flow Esc/Ctrl+D).
- **Drag/drop** BLD-141..144 (move to new parent, reject-into-descendant[toast], ignore interactive elements, cancel restores).
- **Automations list** BLD-145..166 (open flow, open-new-tab Ctrl+click, open table, expand folder, pin/favorite[localStorage], row status toggle[UPDATE_FLOW_STATUS], copy folder URL, rename, duplicate→new window[embed hideDuplicate], move-to[embed hideFolders], export flow[embed hideExportImport], export table, share[not embed], delete, create-inside-folder+menu, load-more, select-all, select-item, folder URL nav, page size, prev, next).
- **Empty/no-results** BLD-167..174 (build from scratch, import flow, use templates, create table, import table, select template, view all templates, clear filters).
- **Filters** BLD-175..185 (search[hideTables placeholder], clear search, filter type/status/connections/owner[not embed]/folder[if exist], clear-all, multi-select search/toggle/clear).
- **Create/import** BLD-186..194 (create-new flow/template/table[hideTables]/folder[hideFolders], import flow[hideExportImport]/table, import file json/zip+folder, ?newFlow nav, ?newTable nav).
- **Bulk** BLD-195..199 (bulk move[hideFolders], bulk export[hideExportImport], bulk delete, clear selection, auto-clear on view change).
- **Folders** BLD-200..204 (create[conflict handling], rename, delete, move-in/out[unpins], folder URL nav).
- **localStorage prefs**: ap.builder.canvasOrientation, defaultPanningMode, ap.builder.testPanelView, ap.builder.testPanelOpen, ib_pinned_items_{proj}_{user}. **URL params**: ?newFlow, ?folderId, ?newTable.

# CLUSTER: Templates · Projects · Members · Alerts · Releases · Analytics · Project-Settings · Shell

> Full table in transcript. Groups:
- **Templates** TPL-01..15 (browse[OFFICIAL/CUSTOM by manageTemplatesEnabled], search, category filter[official only], start-scratch, open details[VIEW telemetry], lazy-load, use-template[sign-in redirect], setup-guide[blogUrl], share[copy link], select preview flow, back, use-dialog[project+folder, INSTALL telemetry], use-shared[public], browse-modal, select-from-browse).
- **Projects** PRJ-01..10 (create[name/email/global-conns; teamProjectsLimit=ONE gate], edit[WRITE_PROJECT; extId=embedding+ADMIN], switch+record-history, sidebar search[≠NONE], visibility-reconcile reload[not embed/templates], set-current+rewrite-path, delete, bulk-subscribe alerts, bulk-unsubscribe[confirm], multi-select property).
- **Switchers** SHL-01..03 (switch platform[CLOUD+!embed], create platform from switcher, create-platform dialog).
- **Members** MEM-01..13 (invite[bulk; null if embed or !WRITE_INVITATION], add-immediately/link/email[SMTP_CONFIGURED], copy-all links, download CSV, 7-day-expiry results, autocomplete+dedup, platform-role select, project-role select, remove member[WRITE_PROJECT_MEMBER; owner-protected], change role, revoke invitation[WRITE_INVITATION], accept invitation, members-table[search/inline-role/remove; owner+admin protected]).
- **Alerts** ALT-01..04 (add team email[WRITE_ALERT], delete team email[WRITE_ALERT+WRITE_PROJECT], personal toggle[personal projects], bulk sub/unsub).
- **Releases** REL-01..12 (view[releasesEnabled+READ_PROJECT_RELEASE+!embed], create-from-git[diff+apply; ConnectGit if none], create-from-project[pick→diff→apply], rollback, preflight-diff[select flow changes+view conn/table changes], detail view, push-flow[WRITE_PROJECT_RELEASE+gitSync+DEVELOPMENT], push-table, push-everything[DEVELOPMENT only], connect-git[URL/branch/folder/SSH], disconnect-git, enable/disable releases).
- **Analytics** ANL-01..19 (Impact[analyticsEnabled]: time-period, project filter, tab, refresh[TTL], search flows, filter time-saved, filter owner, download CSV, inline-edit time-saved[project access], encouragement banner; Leaderboard[analyticsEnabled]: People/Projects tab, time-period, refresh, search, filter time-saved, clear filters, download CSV).
- **Project Settings (MODAL)** SET-01..09 (open[computed initial tab], navigate tabs, General[name/color/extId/maxJobs; TEAM or embedding+ADMIN], Members[TEAM+READ_PROJECT_MEMBER+SHOW_PROJECT_MEMBERS], Alerts[READ_ALERT+SHOW_ALERTS], MCP[URL/JSON/tools/flows], Blocks[table+search+ManageBlocks allow-list; manageBlocksEnabled], Environment[git+release; READ_PROJECT_RELEASE+environmentsEnabled], unsaved-changes badge).
- **Shell** SHL-04..38 (⌘K search[flows/tables/folders/projects/pages; hideTables], recent-access[localStorage 30d], record-access, navigate result[+switch project], clear/kbd-nav, nav links Chat[chatEnabled]/Explore/Impact/Leaderboard, new-project[ADMIN+≠NONE], platform-admin link[admin+!embed], sidebar-hidden[hideSideNav], usage-limits[CLOUD]+Manage-Plan[ADMIN], logo+switcher, user-menu[hidden embed], help-feedback[Community=SHOW_COMMUNITY], collapsible group, sidebar item[locked/notification], platform sidebar[grouped; per-plan locks], upload avatar[5MB/types], theme toggle, language switch+help-translate[SHOW_COMMUNITY], delete account[cloud-not-enterprise+email-match], page-header settings/add-members/members-count, dashboard tabs[per-permission; Releases gated; hideSideNav], page-title branding, route-permission guard[→404], flag-route guard[→/], project-route wrapper[access+switch], default-route, template-details wrapper[SHARED public], after-import redirect, memory-router[embed], platform-layout[admin-only], project-dashboard-layout[reconcile reload; hide-header pages], builder-layout[embed], project-settings-layout guard, embed hide-flags[~14 flags + effects]).

---

## LEDGER SUMMARY (totals — the "lose-nothing" denominator)

| Cluster | ID range | Count |
|---|---|---|
| Flow Builder + Automations + Folders | BLD-001..204 | 204 |
| Platform Admin (~21 pages) | PLT-001..150 | 150 |
| Auth · Billing · Secret-Managers | AUTH/BILL/SMG | ~118 |
| Tables · Connections · Variables | TBL/CON/VAR | 85 |
| Runs · Forms · Public/AI Chat | RUN/FRM/PCH/AIC | 113 |
| Templates·Projects·Members·Alerts·Releases·Analytics·Settings·Shell | TPL/PRJ/MEM/ALT/REL/ANL/SET/SHL | ~110 |
| **TOTAL discrete capabilities** | | **~780** |

Plus §5 net-new additions A1..A7 (undo/redo builder+tables, table sort/filter/paginate, latent-cap surfacing).

**This ~780-row ledger is the acceptance denominator.** The overhaul is complete only when every existing
row is Verified in the new UI (or has a recorded Disposition), and the A1..A7 additions are built.
