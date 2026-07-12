# Capability Ledger — Flow Builder + Automations + Folders (BLD-001..204)

> Full, unabridged extraction. Companion to `../frontend-overhaul-capability-ledger.md` (which carries a
> grouped summary of these rows). This file preserves EVERY row so nothing is lost across sessions.
> Columns: ID · Capability · Trigger · Gate · File:line. Verify file:line against the tree before use.

## Canvas
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-001 | Pan the canvas by dragging (grab mode) | Left-drag on pane (grab) / drag+Shift in select mode | none | flow-canvas/index.tsx:233,242 |
| BLD-002 | Rubber-band select nodes | Left-drag on pane (select/pan mode); Shift-drag in grab | none | flow-canvas/index.tsx:242 |
| BLD-003 | Pan by scroll (free scroll panning) | Mouse/trackpad scroll | none | flow-canvas/index.tsx:235 |
| BLD-004 | Deselect all | Click empty pane | none | flow-canvas/index.tsx:220 |
| BLD-005 | Toggle grab (hand) panning mode; persisted | Controls "Grab mode" / hold Space | localStorage defaultPanningMode | canvas-controls/index.tsx:177; canvas-state.ts:192 |
| BLD-006 | Toggle select (pointer) panning mode; persisted | Controls "Select mode" | none | canvas-controls/index.tsx:183 |
| BLD-007 | Zoom in | Controls "Zoom in" (+) | none | canvas-controls/index.tsx:147 |
| BLD-008 | Zoom out | Controls "Zoom out" (−) | none | canvas-controls/index.tsx:152 |
| BLD-009 | Fit flow to view | Controls "Fit to view" | none | canvas-controls/index.tsx:157 |
| BLD-010 | Download flow as image (screenshot) | Controls "Download as image" | disabled while capturing | canvas-controls/index.tsx:162 |
| BLD-011 | Toggle canvas orientation H/V; persisted | Controls layout button | localStorage ap.builder.canvasOrientation | canvas-controls/index.tsx:169; canvas-state.ts:76 |
| BLD-012 | Toggle minimap; keyboard | Controls "Minimap" / Ctrl+M | none | canvas-controls/index.tsx:137; shortcuts.ts:56 |
| BLD-013 | Pan/zoom via minimap | Drag/scroll on minimap | minimap shown | minimap.tsx:20 |
| BLD-014 | Add sticky note (enter note-create drag) | Controls "Add note" | hidden readonly | canvas-controls/index.tsx:189 |
| BLD-015 | Translate-extent boundary | Pan near edge | none | flow-canvas/index.tsx:185 |
| BLD-016 | Zoom clamp (0.5–1.5) | Zoom gesture | none | flow-canvas/index.tsx:231 |
| BLD-017 | Auto-recenter viewport on resize | Resize builder panel | none | flow-canvas/hooks.tsx:193 |
| BLD-018 | Context-menu chevron next to multi-select rect | Auto on selection; click opens menu | none | selection-chevron-button.tsx:9 |

## Step node
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-019 | Select a step (opens settings) | Click step node | none | step-node/index.tsx:74 |
| BLD-020 | Open step context menu | Right-click step (or chevron) | none | step-node/index.tsx:88 |
| BLD-021 | Open step context menu via chevron | Click chevron on step | hidden readonly | step-node/index.tsx:208 |
| BLD-022 | Drag a step to move it | Drag step node | disabled trigger & readonly | step-node/index.tsx:66 |
| BLD-023 | Replace a step's block | Click step / context-menu Replace | none | step-node/index.tsx:162 |
| BLD-024 | Configure empty trigger | Click empty trigger node | none | step-node/index.tsx:80 |
| BLD-025 | Add first/edge action (block selector) | Click "+" on edge | hidden readonly | edges/add-button.tsx:84 |
| BLD-026 | Drop dragged step onto add button (move) | Drag over add-button drop zone | hidden readonly | edges/add-button.tsx:25 |
| BLD-027 | Add first branch/loop child (big "+") | Click big "+" inside branch/loop | hidden readonly (connector line) | big-add-button-node.tsx:86 |
| BLD-028 | Loop iteration stepper — up | Loop up-chevron (during run) | run present & loop | loop-iteration-input.tsx:70 |
| BLD-029 | Loop iteration stepper — down | Loop down-chevron | run present & loop | loop-iteration-input.tsx:110 |
| BLD-030 | Loop iteration stepper — type number (clamped) | Number input on loop node | run present; clamp [1,total] | loop-iteration-input.tsx:55 |

## Context menu (right-click step / canvas)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-031 | Replace step | Menu → Replace | single-select, STEP, !readonly | canvas-context-menu-content.tsx:117 |
| BLD-032 | Copy step(s) to clipboard | Menu → Copy (Ctrl+C) | STEP, excludes trigger | canvas-context-menu-content.tsx:122; bulk-actions.ts:20 |
| BLD-033 | Duplicate step | Menu → Duplicate | single, no trigger, STEP, !readonly | canvas-context-menu-content.tsx:126 |
| BLD-034 | Skip / Unskip step(s) | Menu → Skip/Unskip (Ctrl+E) | STEP, excludes trigger, !readonly | canvas-context-menu-content.tsx:131; bulk-actions.ts:107 |
| BLD-035 | Copy reference `{{step['output']}}` | Menu → Copy reference | single-select, STEP | canvas-context-menu-content.tsx:124 |
| BLD-036 | Paste after last step | Canvas menu → Paste After Last Step | CANVAS, !readonly | canvas-context-menu-content.tsx:93; bulk-actions.ts:93 |
| BLD-037 | Paste inside loop (first action) | Step menu → Paste Inside Loop | single loop step, !readonly | canvas-context-menu-content.tsx:95 |
| BLD-038 | Paste after current step | Step menu → Paste After | single, STEP, !readonly | canvas-context-menu-content.tsx:113 |
| BLD-039 | Paste inside specific router branch | Step menu → Paste Inside… → {branch} | single router, !readonly | canvas-context-menu-content.tsx:100 |
| BLD-040 | Paste into new router branch (creates + pastes) | Paste Inside… → + New Branch | single router, !readonly | canvas-context-menu-content.tsx:328 |
| BLD-041 | Paste into continue-on-failure Success branch | Paste Inside… → Success | single code/block w/ continueOnFailure, !readonly | canvas-context-menu-content.tsx:105 |
| BLD-042 | Paste into continue-on-failure Failure branch | Paste Inside… → Failure | same | canvas-context-menu-content.tsx:380 |
| BLD-043 | Delete selected step(s) | Menu → Delete (Shift+Del) | STEP, !readonly, trigger excluded | canvas-context-menu-content.tsx:135; bulk-actions.ts:35 |
| BLD-044 | Empty-clipboard toast on paste | Paste w/ empty/invalid clipboard | none | bulk-actions.ts:84 |

## Step settings
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-045 | Edit step settings form (auto-saves) | Change any field | disabled when readonly | step-settings/index.tsx:84 |
| BLD-046 | Close step settings sidebar | Header close (X) | none | step-settings/index.tsx:247 |
| BLD-047 | Rename step inline | Click name / pencil | disabled readonly | editable-step-name.tsx:92 |
| BLD-048 | Navigate to previous step | Header ◀ | disabled at first | step-navigation-buttons.tsx:50 |
| BLD-049 | Navigate to next step | Header ▶ | disabled at last | step-navigation-buttons.tsx:66 |
| BLD-050 | Change/upgrade block version | Header version switcher | !readonly & block step | step-settings/index.tsx:262 |
| BLD-051 | Toggle "Add Error Handler" (continue on failure) | Error handling switch | disabled readonly; hidden hideContinueOnFailure | action-error-handling.tsx:41 |
| BLD-052 | Toggle "Retry on Failure" | Error handling switch | disabled readonly; hidden hideRetryOnFailure | action-error-handling.tsx:70 |
| BLD-053 | Toggle split-view/drawer for data panel; persisted | "Split View"/"Collapse" | localStorage ap.builder.testPanelView | step-data-panel-view-toggle.tsx:26 |
| BLD-054 | Auto-collapse split panel to drawer <700px | Drag resize < 700 | split mode | builder/index.tsx:116 |
| BLD-055 | Resize the settings/right sidebar | Drag resize handle | disabled when sidebar NONE | builder/index.tsx:185 |
| BLD-056 | Select connection for block auth | Connection dropdown | none | connection-select.tsx:158 |
| BLD-057 | Create new connection | Dropdown → Create Connection | WRITE_APP_CONNECTION | connection-select.tsx:257 |
| BLD-058 | Reconnect existing connection | Cable icon | WRITE_APP_CONNECTION | connection-select.tsx:180 |

## Router / branch settings
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-059 | Set router execution type (first/all-match) | Execute dropdown | disabled readonly | router-settings/index.tsx:138 |
| BLD-060 | Add a branch | "Add Branch" | hidden readonly | branches-toolbar.tsx:16 |
| BLD-061 | Select/open a branch (focus) | Click branch row | none | router-settings/index.tsx:209 |
| BLD-062 | Rename branch inline | Branch row pencil | disabled readonly | branches-list.tsx:150 |
| BLD-063 | Duplicate branch | Branch duplicate button | pointer-off readonly | branches-list.tsx:216 |
| BLD-064 | Delete branch | Branch trash | only if >2; hidden readonly | branches-list.tsx:183 |
| BLD-065 | Reorder branches (drag) | Branch drag handle | disabled readonly | branches-list.tsx:231 |
| BLD-066 | Edit branch condition first value | "First value" mention input | disabled readonly | branch-single-condition.tsx:92 |
| BLD-067 | Choose condition operator | Operator searchable select | disabled readonly | branch-single-condition.tsx:125 |
| BLD-068 | Edit branch condition second value | "Second value" mention input | hidden single-value ops; disabled readonly | branch-single-condition.tsx:156 |
| BLD-069 | Toggle case-sensitive on text condition | Case-sensitive switch | text-condition; disabled readonly | branch-single-condition.tsx:178 |
| BLD-070 | Remove a single condition | Condition "Remove" | not sole condition | branch-single-condition.tsx:200 |
| BLD-071 | Add AND condition | Toolbar "+ And" | disabled readonly | branch-condition-toolbar.tsx:16 |
| BLD-072 | Add OR condition group | Toolbar "+ Or" | disabled readonly | branch-condition-toolbar.tsx:27 |
| BLD-073 | Return to router from branch view | Flow displayName crumb | none | editable-step-name.tsx:60 |

## Loop settings
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-074 | Set loop "Items" array (mention input) | Items input | disabled readonly | loops-settings.tsx:22 |

## Code settings
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-075 | Edit code inputs (key/value + mentions) | Inputs dictionary | disabled readonly | code-settings/index.tsx:38 |
| BLD-076 | Edit source code (CodeMirror) | Code editor | readonly locks | code-settings/index.tsx:74 |
| BLD-077 | Switch Code / Dependencies tab | "Code"/"Dependencies" tab | Deps hidden unless ALLOW_NPM_PACKAGES_IN_CODE_STEP | code-editor.tsx:96 |
| BLD-078 | Add NPM package (fetch latest version) | "Add package" → dialog → Add | flag ALLOW_NPM_PACKAGES_IN_CODE_STEP | add-npm-dialog.tsx:45 |

## Data selector
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-079 | Show data selector on mention-input focus | Focus text-with-mentions input | none | data-selector/index.tsx:290 |
| BLD-080 | Search data tree | Data selector search | none | data-selector/index.tsx:372 |
| BLD-081 | Toggle Friendly / Advanced view | Friendly/Advanced tabs | none | data-selector/index.tsx:377 |
| BLD-082 | Switch Data / Variables tab | Data/Variables tabs | none | data-selector/index.tsx:341 |
| BLD-083 | Expand data selector to fullscreen | Size toggler Expand | none | data-selector-size-togglers.tsx:40 |
| BLD-084 | Dock data selector (450px) | Size toggler Dock | none | data-selector-size-togglers.tsx:53 |
| BLD-085 | Minimize/collapse data selector | Size toggler Minimize | none | data-selector-size-togglers.tsx:66 |
| BLD-086 | Insert data reference (click node) | Click insertable node | none | data-selector/index.tsx:392 |

## Runs sidebar
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-087 | Open Runs sidebar | Header "Runs" | hidden without READ_FLOW | builder-header.tsx:191 |
| BLD-088 | Close Runs sidebar | Header close | none | run-list/index.tsx:101 |
| BLD-089 | Load more runs (infinite) | "More..." | if hasNextPage | run-list/index.tsx:131 |
| BLD-090 | Open a run (navigate /runs/:id) | Click run card | none | flow-run-card.tsx:68 |
| BLD-091 | Retry run on latest version | Card retry → On latest | WRITE_RUN | flow-run-card.tsx:170 |
| BLD-092 | Retry run from failed step | Card retry → From failed | run failed; WRITE_RUN | flow-run-card.tsx:190 |
| BLD-093 | Auto-poll running runs (15s) | Automatic non-terminal | none | run-list/index.tsx:61 |

## Live run / run info
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-094 | Auto-follow live run (focus current step) | Automatic during run | suppressed if manual-selected | flow-canvas/hooks.tsx:163 |
| BLD-095 | Resume live-follow of run updates | "Follow run updates" | non-terminal & manual-selected | run-info-widget.tsx:170 |
| BLD-096 | Jump to failed step ("See error") | "See error" | run has failedStep & not viewing | run-info-widget.tsx:191 |
| BLD-097 | Poll existing prod run until terminal (5s) | Auto on runs page | PRODUCTION, non-terminal, /runs | flow-canvas/hooks.tsx:40 |
| BLD-098 | Manual step selection marks "manually selected" | Click step while run active | none | canvas-state.ts:137 |

## Versions
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-099 | Open Version History sidebar | Flow menu → Versions | none | builder-header.tsx:147 |
| BLD-100 | Close versions sidebar | Header close | none | flow-versions/index.tsx:26 |
| BLD-101 | View a past version (read-only load) | Version card menu → View | readonly if LOCKED/no WRITE_FLOW | flow-versions-card.tsx:111 |
| BLD-102 | Use a version as draft (overwrite) | Card menu → Use as Draft → Overwrite | hidden DRAFT; disabled no WRITE_FLOW | flow-versions-card.tsx:118 |
| BLD-103 | Use current viewed version as draft | Widget → Use as Draft | with WRITE_FLOW | viewing-old-version-widget.tsx:43 |
| BLD-104 | Return to draft / Edit flow from old version | Widget → Edit/View draft | see BLD-116 | viewing-old-version-widget.tsx:54 |

## Publish
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-105 | Publish flow | "Publish" | disabled if invalid; DRAFT+WRITE_FLOW & no run | publish-flow-reminder-widget.tsx:119 |
| BLD-106 | Discard unpublished changes | "Discard changes" | publishedVersionId exists & not saving | publish-flow-reminder-widget.tsx:108 |
| BLD-107 | Toggle flow enabled/disabled (status switch) | Header status switch | UPDATE_FLOW_STATUS; disabled if unpublished | flow-status-toggle.tsx:54 |
| BLD-108 | Rename flow inline (header) | Click name/breadcrumb | readonly if not latest | builder-header.tsx:126 |
| BLD-109 | Auto-enter rename on new flow | URL ?newFlow=true | none | builder-header.tsx:88 |
| BLD-110 | Flow actions menu (delete/rename/move/duplicate/versions) | Header chevron → FlowActionMenu | readonly if not latest | builder-header.tsx:147 |
| BLD-111 | Navigate back to automations (breadcrumb) | Project-name breadcrumb | hidden embed disableNavigationInBuilder | builder-header.tsx:105 |
| BLD-112 | Open Support | Header "Support" | flag SHOW_COMMUNITY | builder-header.tsx:180 |
| BLD-113 | Test Flow / Run Flow (above trigger) | "Test/Run Flow" | hidden if invalid/hideTestWidget/manual-unpublished; disabled if trigger untested | test-flow-widget.tsx:110 |
| BLD-114 | Open Chat (chat-trigger flows) | "Open Chat" | chat trigger only | test-flow-widget.tsx:98 |
| BLD-115 | Jump to first incomplete step | Amber "incomplete" button | flow invalid & not readonly | incomplete-settings-widget.tsx:44 |
| BLD-116 | Edit flow / View draft (switch to draft) | Button (Esc/Ctrl+D) | readonly; text depends WRITE_FLOW | view-draft-or-edit-flow-button.tsx:25 |
| BLD-117 | Take over an editing lock | Take-over affordance | when locked by another | use-flow-lock.ts:15 |
| BLD-118 | beforeunload warning while saving | Close/leave tab while saving | skipped when embedded | flow-canvas/hooks.tsx:69 |

## Test step (settings panel)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-119 | Test step | "Test Step" (Ctrl+G) | disabled if invalid/saving/loading | test-step-cta-button.tsx:178 |
| BLD-120 | Retest step | "Retest Step" (Ctrl+G) | sample data exists | test-step-cta-button.tsx:147 |
| BLD-121 | Test trigger | "Test Trigger" | disabled if invalid/testing/not-ready; hidden manual | test-step-cta-button.tsx:281 |
| BLD-122 | Retest trigger | "Retest Trigger" | sample data exists | test-step-cta-button.tsx:251 |
| BLD-123 | Show sample data / output | "Show Sample Data"/"Show Output" | data/run exists | test-step-cta-button.tsx:129 |
| BLD-124 | "Configure step first" toast on shortcut | Ctrl+G on invalid step | step invalid | test-step-cta-button.tsx:302 |

## Notes
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-125 | Create note by placing overlay | Add note then drop on canvas | not readonly | notes-state.tsx:51 |
| BLD-126 | Edit note content (double-click) | Double-click note body | disabled readonly | note-node/index.tsx:166 |
| BLD-127 | Note read-only-viewable but not editable in readonly | Readonly builder | editing disabled, visible | note-node/index.tsx:147 |
| BLD-128 | Change note color | Note tools color picker | tools hidden readonly | note-tools.tsx:69 |
| BLD-129 | Delete note | Note tools trash | tools hidden readonly | note-tools.tsx:43 |
| BLD-130 | Resize note (150–600px) | Drag resize control | onResizeEnd persists | note-node/index.tsx:64 |
| BLD-131 | Move note (drag) | Drag note node | move persisted | note-node/index.tsx:33 |
| BLD-132 | Escape blurs/exits note editing | Esc while editing | none | note-node/index.tsx:52 |
| BLD-133 | Markdown formatting tools in note | Note tools markdown buttons | tools hidden readonly | note-tools.tsx:41 |

## Keyboard shortcuts (canvas-global)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-134 | Copy selected nodes | Ctrl/⌘+C | no text selection & non-trigger selected | shortcuts.ts:59 |
| BLD-135 | Paste (after last / after selected) | Ctrl/⌘+V | !readonly; target selection-rect/step/body | shortcuts.ts:104 |
| BLD-136 | Delete selected nodes | Shift+Delete | !readonly | shortcuts.ts:73 |
| BLD-137 | Skip/unskip selected nodes | Ctrl/⌘+E | !readonly; excludes trigger | shortcuts.ts:88 |
| BLD-138 | Toggle minimap | Ctrl/⌘+M | none | shortcuts.ts:56 |
| BLD-139 | Exit/cancel active drag | Escape | none | shortcuts.ts:100 |
| BLD-140 | Edit-flow / test shortcut | Esc or Ctrl/⌘+D | contextual (readonly/test) | above-trigger-button.tsx:34 |

## Drag & drop behaviors
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-141 | Move step to new parent/location (drop) | Drop on add/big-add button | MOVE_ACTION | flow-drag-layer.tsx:160 |
| BLD-142 | Reject drop into own descendant ("Invalid Move") | Drop inside child of itself | blocks move | flow-drag-layer.tsx:183 |
| BLD-143 | Drag ignores interactive/contenteditable | Pointer-down on input/button/CE | drag not activated | flow-drag-layer.tsx:237 |
| BLD-144 | Drag cancel restores state | onDragCancel | none | flow-drag-layer.tsx:114 |

## Automations list
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-145 | Open a flow | Click flow row | none | routes/automations/index.tsx:172 |
| BLD-146 | Open flow in new tab | Ctrl/⌘+click flow row | none | routes/automations/index.tsx:191 |
| BLD-147 | Open a table | Click table row | none | routes/automations/index.tsx:196 |
| BLD-148 | Expand/collapse folder | Click folder row chevron | none | routes/automations/index.tsx:166 |
| BLD-149 | Pin/unpin (favorite) to top | Star button (depth-0) | localStorage ib_pinned_items_* | automations-table-row.tsx:143 |
| BLD-150 | Toggle flow enabled/disabled from row | Row status switch | UPDATE_FLOW_STATUS; disabled unpublished | automations-table-row.tsx:208 |
| BLD-151 | Copy folder URL | Folder ⋯ → Copy URL | folder rows only | automations-table-row.tsx:263 |
| BLD-152 | Rename item (flow/table/folder) | Row ⋯ → Rename | none | automations-table-row.tsx:277 |
| BLD-153 | Duplicate flow (opens copy in new window) | Row ⋯ → Duplicate | flow; hidden embed hideDuplicateFlow | automations-table-row.tsx:282 |
| BLD-154 | Move flow/table to folder | Row ⋯ → Move To | flow/table; hidden embed hideFolders | automations-table-row.tsx:296 |
| BLD-155 | Export a flow | Row ⋯ → Export | flow; hidden embed hideExportAndImportFlow | automations-table-row.tsx:309 |
| BLD-156 | Export a table | Row ⋯ → Export | table only | automations-table-row.tsx:316 |
| BLD-157 | Share flow as template | Row ⋯ → Share | flow; hidden embedded | automations-table-row.tsx:323 |
| BLD-158 | Delete item (confirm) | Row ⋯ → Delete | none | automations-table-row.tsx:335 |
| BLD-159 | Create inside folder (+ menu) | Folder hover "+" → New Flow/Table/Import | perms; import per embed flags | automations-table-row.tsx:219 |
| BLD-160 | Load more items in a folder | "Load N more items…" | load-more nodes | automations-table-row.tsx:109 |
| BLD-161 | Select all (header checkbox) | Header checkbox | none | automations-table.tsx:127 |
| BLD-162 | Select individual item | Row checkbox | none | automations-table-row.tsx:130 |
| BLD-163 | Navigate folder via URL param | ?folderId= on create/back | replace-history | routes/automations/index.tsx:252 |
| BLD-164 | Change page size | Pagination "Rows per page" | clears selection | automations-pagination.tsx:38 |
| BLD-165 | Previous page | Pagination "Previous" | disabled page 0; clears selection | automations-pagination.tsx:54 |
| BLD-166 | Next page | Pagination "Next" | disabled last page; clears selection | automations-pagination.tsx:64 |

## Automations empty / no-results states
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-167 | Empty: Build a flow from scratch | "Start from scratch" | disabled no WRITE_FLOW | automations-empty-state.tsx:268 |
| BLD-168 | Empty: Import flow | "Import" | disabled no WRITE_FLOW | automations-empty-state.tsx:275 |
| BLD-169 | Empty: Use templates | "Use Templates" | WRITE_FLOW; embed→dialog | automations-empty-state.tsx:297 |
| BLD-170 | Empty: Create table from scratch | "Start from scratch" (table) | hidden embed hideTables; WRITE_TABLE | automations-empty-state.tsx:311 |
| BLD-171 | Empty: Import table | "Import" (table) | WRITE_TABLE | automations-empty-state.tsx:325 |
| BLD-172 | Empty: Select a suggested template | Click template card | embed→dialog else navigate | automations-empty-state.tsx:232 |
| BLD-173 | Empty: View all templates | "All templates" | embed→dialog else navigate | automations-empty-state.tsx:241 |
| BLD-174 | No-results: Clear filters | "Clear filters" | filters active & no results | automations-no-results-state.tsx:24 |

## Automations filters
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-175 | Search flows/tables | Search input | placeholder varies hideTables | automations-filters.tsx:144 |
| BLD-176 | Clear search | X in search | when non-empty | automations-filters.tsx:159 |
| BLD-177 | Filter by type | "Type" multi-select | Tables option hidden if hideTables | automations-filters.tsx:172 |
| BLD-178 | Filter by status | "Status" multi-select | none | automations-filters.tsx:183 |
| BLD-179 | Filter by connections | "Connections" multi-select | none | automations-filters.tsx:194 |
| BLD-180 | Filter by owner | "Owner" multi-select | hidden embedded | automations-filters.tsx:206 |
| BLD-181 | Filter by folder | "Folder" multi-select | only if folders exist | automations-filters.tsx:220 |
| BLD-182 | Clear all filters | "Clear all" | when filters active | automations-filters.tsx:234 |
| BLD-183 | Multi-select: search within options | Popover search | searchable filters | multi-select-filter.tsx:97 |
| BLD-184 | Multi-select: toggle option | Option row/checkbox | none | multi-select-filter.tsx:117 |
| BLD-185 | Multi-select: clear all in filter | "Clear all" footer | when values selected | multi-select-filter.tsx:136 |

## Automations create / import
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-186 | Create New → New Flow | "Create New" → New Flow | disabled no WRITE_FLOW | create-new-menu.tsx:57 |
| BLD-187 | Create New → Start from Template | → Start from Template | root; WRITE_FLOW | create-new-menu.tsx:75 |
| BLD-188 | Create New → New Table | → New Table | hidden hideTables; WRITE_TABLE | create-new-menu.tsx:88 |
| BLD-189 | Create New → New Folder | → New Folder | root; hidden hideFolders; WRITE_FOLDER | create-new-menu.tsx:145 |
| BLD-190 | Import → Import Flow | "Import" → Import Flow | hidden hideExportAndImportFlow; WRITE_FLOW | automations-filters.tsx:251 |
| BLD-191 | Import → Import Table | "Import" → Import Table | hidden hideTables; WRITE_TABLE | automations-filters.tsx:277 |
| BLD-192 | Import flow file (json/zip) + folder | Import dialog → file+folder → Import | zip only outside builder; folder select hidden hideFolders | import-flow-dialog.tsx:182 |
| BLD-193 | Create flow navigates ?newFlow=true | After New Flow | none | use-automations-mutations.ts:55 |
| BLD-194 | Create table navigates ?newTable=true | After New Table | none | use-automations-mutations.ts:69 |

## Automations bulk (selection bar)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-195 | Bulk move to folder | Bar "Move to" → dialog | hidden hideFolders; disabled if none movable | automations-selection-bar.tsx:46 |
| BLD-196 | Bulk export (flows + tables) | Bar "Export" | hidden hideExportAndImportFlow; disabled if none exportable | automations-selection-bar.tsx:57 |
| BLD-197 | Bulk delete (confirm) | Bar "Delete" → confirm | disabled while deleting | automations-selection-bar.tsx:72 |
| BLD-198 | Clear selection | Bar X | none | automations-selection-bar.tsx:96 |
| BLD-199 | Selection auto-clears on view change | Filter/page/collapse | automatic | routes/automations/index.tsx:142 |

## Folders
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| BLD-200 | Create folder (name conflict handling) | Create Folder dialog → Confirm | conflict → "already exists" | create-folder-dialog.tsx:41 |
| BLD-201 | Rename folder | Folder ⋯ → Rename | none | use-automations-mutations.ts:170 |
| BLD-202 | Delete folder | Folder ⋯ → Delete | none | use-automations-mutations.ts:88 |
| BLD-203 | Move item into/out of folder (unpins when into folder) | Move dialog → Move; Uncategorized = no folder | none | move-to-folder-dialog.tsx:53 |
| BLD-204 | Navigate to created folder via URL param | After folder create | replace-history folderId | create-folder-dialog.tsx:62 |
