# Capability Ledger — Platform Admin (PLT-001..150)

> Full, unabridged extraction. Companion to `../frontend-overhaul-capability-ledger.md`.
> Columns: ID · Capability · Trigger · Gate · File:line (paths under app/routes/platform/**).

## Projects
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-001 | View projects table (Name, Active Users, Active Flows, External ID[if embeddingEnabled], Global Connections[if globalConnectionsEnabled], Created) | Page load | LockedFeatureGuard PROJECTS (teamProjectsLimit≠NONE) | projects/index.tsx:347; columns.tsx:109 |
| PLT-002 | Filter projects by Name | Filter input | none | projects/index.tsx:372 |
| PLT-003 | Filter projects by Type (Team/Personal) | Filter select | none | projects/index.tsx:379 |
| PLT-004 | Switch to / open project (sets current, navigate /) | Row click | none | projects/index.tsx:368 |
| PLT-005 | Create new project | "New Project" (CreateProjectButton) | teamProjectsLimit gate | projects/index.tsx:294 |
| PLT-006 | Edit project (rename projectName) | Row pencil → EditProjectDialog | none | projects/index.tsx:324 |
| PLT-007 | Select projects for bulk (current/personal disabled) | Header+row checkboxes | current & PERSONAL disabled | projects/index.tsx:130 |
| PLT-008 | Bulk-delete projects (blocks enabled-flows/active) | Bulk Delete → confirm | disabled unless deletable selected | projects/index.tsx:246 |
| PLT-009 | Bulk alert-subscription on selected projects | Bulk action | none | projects/index.tsx:225 |

## Users
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-010 | View users + pending invitations table | Page load | LockedFeatureGuard USERS (locked=false) | users/index.tsx:107 |
| PLT-011 | Invite user | "Invite" → InviteUserDialog | none | users/index.tsx:132 |
| PLT-012 | Edit user role + External ID (Admin/Operator/Member) | Row menu → Edit → UpdateUserDialog | non-invitation | user-actions.tsx:54 |
| PLT-013 | Activate / Deactivate user | Row menu → Activate/Deactivate | disabled if Admin/updating; non-invitation | user-actions.tsx:67 |
| PLT-014 | Delete user | Row menu → Delete → confirm | none | user-actions.tsx:83 |
| PLT-015 | Delete pending invitation | Row menu → Delete (invitation) | none | user-actions.tsx:94 |

## Connections (platform-wide read)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-016 | View all app connections across projects (read-only) | Page load | none | connections/index.tsx:221 |
| PLT-017 | Filter by Name | Filter input | none | connections/index.tsx:56 |
| PLT-018 | Filter by Status | Filter select | none | connections/index.tsx:63 |
| PLT-019 | Filter by Block | Filter select | none | connections/index.tsx:73 |
| PLT-020 | Filter by Project | Filter select | none | connections/index.tsx:82 |
| PLT-021 | Filter by Owner (truncated, notice) | Filter select | limited to first N owners | connections/index.tsx:91 |
| PLT-022 | Copy connection External ID | CopyTextTooltip on name | none | connections/index.tsx:117 |
| PLT-023 | Navigate to project from connection | Project link | none | connections/index.tsx:275 |

## Global Connections (setup)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-024 | View global connections (+Default tag) | Page load | LockedFeatureGuard GLOBAL_CONNECTIONS | setup/connections/index.tsx:311 |
| PLT-025 | Filter by Search (displayName) | Filter input | none | setup/connections/index.tsx:57 |
| PLT-026 | Filter by Status | Filter select | none | setup/connections/index.tsx:65 |
| PLT-027 | Create new global connection | "New Connection" (isGlobalConnection) | none | setup/connections/index.tsx:293 |
| PLT-028 | Edit global connection (name/projectIds/preSelect) | Row EditGlobalConnectionDialog | none | setup/connections/index.tsx:185 |
| PLT-029 | Reconnect global connection | Row ReconnectButtonDialog | none | setup/connections/index.tsx:197 |
| PLT-030 | Bulk-delete global connections | Select → Delete → confirm | disabled unless WRITE_APP_CONNECTION | setup/connections/index.tsx:251 |

## AI Providers
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-031 | View supported AI providers + config status | Page load | LockedFeatureGuard UNIVERSAL_AI (ADMIN); write=aiProvidersEnabled | setup/ai/index.tsx:53 |
| PLT-032 | Select chat provider | ChatProviderSelector → toggleChatProvider | allowWrite & providers exist | setup/ai/index.tsx:75 |
| PLT-033 | Open Chat Analytics | ChatAnalyticsLinkButton | none | setup/ai/index.tsx:72 |
| PLT-034 | Enable a provider | Card "Enable" | allowWrite | ai-provider-card.tsx:44 |
| PLT-035 | Edit a configured provider | Card pencil → UpsertAIProviderDialog | allowWrite | ai-provider-card.tsx:52 |
| PLT-036 | Delete a configured provider | Card trash → confirm | allowWrite; configured only | ai-provider-card.tsx:62 |
| PLT-037 | Save provider config (create/update; edit preserves secrets) | Dialog "Save" | none | upsert-provider-dialog.tsx:167 |
| PLT-038 | Sub-form ANTHROPIC/GOOGLE/OPENAI: API Key (shown-once edit toggle) | Dialog fields | edit hides key behind Edit | upsert-provider-config-form.tsx:74 |
| PLT-039 | Sub-form AZURE: API Key + Resource Name + API Version(opt) | Azure fields | Azure schema | upsert-provider-config-form.tsx:116 |
| PLT-040 | Sub-form CLOUDFLARE_GATEWAY: Token+Account+Gateway+Vertex Region+Vertex Project+Models | Cloudflare fields | custom vertex validation | upsert-provider-config-form.tsx:167 |
| PLT-041 | Sub-form BEDROCK: AWS Access Key+Secret(edit toggle)+Region | Bedrock fields | Bedrock schema | upsert-provider-config-form.tsx:253 |
| PLT-042 | Sub-form CUSTOM: Display Name+API Key+Base URL+Header+Custom Headers+Models | Custom fields | OpenAICompatible schema | upsert-provider-config-form.tsx:353 |
| PLT-043 | Add model (Model ID/Name/Type Text/Image) | "Add Model" → ModelFormPopover | CUSTOM/CLOUDFLARE only | upsert-provider-config-form.tsx:418 |
| PLT-044 | Edit model in list | Model row pencil | same | upsert-provider-config-form.tsx:492 |
| PLT-045 | Remove model from list | Model row trash | same | upsert-provider-config-form.tsx:506 |

## MCP
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-046 | View Platform MCP server (URL + JSON config) | Page load; Connection tab | none | setup/mcp/index.tsx:55 |
| PLT-047 | Copy Server URL | CopyToClipboardInput | none | setup/mcp/index.tsx:72 |
| PLT-048 | Copy/expand JSON configuration | CollapsibleJson | none | setup/mcp/index.tsx:78 |
| PLT-049 | Enable/disable internal MCP tools | Tools tab → McpTools toggles | none | setup/mcp/index.tsx:103 |

## Blocks
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-050 | View blocks table (Name+tags, Package, Version) | Page load | LockedAlert if !manageBlocksEnabled | setup/pieces/index.tsx:144 |
| PLT-051 | Filter blocks by name | Filter input | none | setup/pieces/index.tsx:172 |
| PLT-052 | Request trial for enterprise blocks | LockedAlert RequestTrial | !manageBlocksEnabled | setup/pieces/index.tsx:157 |
| PLT-053 | Sync blocks from Cloud | "Sync from Cloud" | BLOCKS_SYNC_MODE===OFFICIAL_AUTO | sync-pieces.tsx:17 |
| PLT-054 | Install block | "Install" → InstallBlockDialog (PLATFORM) | none | setup/pieces/index.tsx:198 |
| PLT-055 | Show/Hide block for all projects | Row eye/eye-off | disabled unless manageBlocksEnabled | piece-actions.tsx:41 |
| PLT-056 | Pin/Unpin block | Row pin/pin-off | disabled unless manageBlocksEnabled | piece-actions.tsx:70 |
| PLT-057 | Configure block OAuth2 app (Client ID+Secret) | Row unlock → dialog Save | disabled unless manageBlocksEnabled; OAuth2 non-CC only | update-oauth2-dialog.tsx:65 |
| PLT-058 | Delete block OAuth2 app | Row lock icon → delete | disabled unless manageBlocksEnabled | update-oauth2-dialog.tsx:79 |
| PLT-059 | Bulk apply/toggle tags on selected blocks | Select → "Apply Tags" → Apply | none | apply-tags.tsx:82 |
| PLT-060 | Create new tag | Apply Tags → "+ New Tag" | none | create-tag-dialog.tsx:25 |
| PLT-061 | Delete tag (from all blocks) | Tag row trash → confirm | none | apply-tags.tsx:131 |

## Templates
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-062 | View custom templates table | Page load | LockedFeatureGuard TEMPLATES | templates/index.tsx:210 |
| PLT-063 | Create template (Name/Summary/Desc/Blog/upload json) | "New Template" → dialog | none | create-template-dialog.tsx:43 |
| PLT-064 | Edit template (+optional re-upload json) | Row pencil → dialog | none | update-template-dialog.tsx:41 |
| PLT-065 | Select templates | Header/row checkbox | none | templates/index.tsx:62 |
| PLT-066 | Bulk-delete templates | Bulk Delete → confirm | none | templates/index.tsx:157 |

## Branding
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-067 | View/edit appearance form | Page load | LockedFeatureGuard BRANDING | appearance-section.tsx:32 |
| PLT-068 | Update platform name | Name input | none | appearance-section.tsx:83 |
| PLT-069 | Upload Logo image | Logo file input | none | appearance-section.tsx:100 |
| PLT-070 | Upload Icon image | Icon file input | none | appearance-section.tsx:118 |
| PLT-071 | Upload Favicon image | Favicon file input | none | appearance-section.tsx:137 |
| PLT-072 | Set primary color | ColorPicker | none | appearance-section.tsx:159 |
| PLT-073 | Save branding (multipart, reloads) | "Save" | disabled unless valid | appearance-section.tsx:182 |

## Billing
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-074 | View billing (SubscriptionInfo when active, license) | Page load | LockedFeatureGuard BILLING (edition≠COMMUNITY) | billing/index.tsx:30 |
| PLT-075 | Open Chat Analytics | ChatAnalyticsLinkButton | none | billing/index.tsx:82 |
| PLT-076 | Access Stripe billing portal | "Access Billing Portal" | sub active OR AI auto-topup enabled | billing/index.tsx:87 |
| PLT-077 | Manage Active Flow addon | ActiveFlowAddon | !isCommunity | billing/index.tsx:102 |
| PLT-078 | View/manage AI credit usage (+auto-topup) | AICreditUsage | !isCommunity | billing/index.tsx:103 |
| PLT-079 | View/enter License Key | LicenseKey | none | billing/index.tsx:106 |

## API Keys
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-080 | View API keys (name, sk-…trunc, created, last used) | Page load | LockedFeatureGuard API | api-keys/index.tsx:41 |
| PLT-081 | Create API key (Name) — shown-once secret w/ copy | "New API Key" → Create → CopyInput → Done | none | new-api-key-dialog.tsx:82 |
| PLT-082 | Revoke API key | Row menu → Revoke → confirm | none | api-keys/index.tsx:111 |

## Secret Managers
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-083 | View secret manager connections (Scope/Status) | Page load | LockedFeatureGuard SECRET_MANAGERS | secret-managers/index.tsx:191 |
| PLT-084 | Create connection (Provider/Name/Scope/ProjectSelector) | "New Connection" → dialog | none | connect-...dialog.tsx:132 |
| PLT-085 | Sub-form HASHICORP: url, roleId, secretId | Dynamic fields | selectedProvider.fields | util.ts:51 |
| PLT-086 | Sub-form AWS: accessKeyId, secretAccessKey, region | Dynamic fields | same | util.ts:57 |
| PLT-087 | Sub-form CYBERARK: org, loginId, url, apiKey | Dynamic fields | same | util.ts:63 |
| PLT-088 | Sub-form 1PASSWORD: serviceAccountToken | Dynamic fields | same | util.ts:74 |
| PLT-089 | Edit connection (server error on connect-failure) | Row pencil → Save | none | connect-...dialog.tsx:107 |
| PLT-090 | Clear cache for connection | Row refresh → clearCache | none | secret-managers/index.tsx:161 |
| PLT-091 | Delete connection (warns breaks flows/conns) | Row trash → confirm | none | secret-managers/index.tsx:162 |

## Audit Logs
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-092 | View audit log table | Page load | LockedFeatureGuard AUDIT_LOGS | audit-logs/index.tsx:107 |
| PLT-093 | Filter by Action | Filter select | none | audit-logs/index.tsx:57 |
| PLT-094 | Filter by Performed By | Filter select | none | audit-logs/index.tsx:69 |
| PLT-095 | Filter by Project | Filter select | none | audit-logs/index.tsx:82 |
| PLT-096 | Filter by Created (date) | Filter date | none | audit-logs/index.tsx:95 |
| PLT-097 | Open event detail sheet (Who&When, IP, payload JSON) | Row eye → Sheet | none | audit-logs/index.tsx:232 |
| PLT-098 | Navigate to project from log row | Project link | when projectId present | audit-logs/index.tsx:201 |
| PLT-099 | Open Chat Analytics | ChatAnalyticsLinkButton | none | audit-logs/index.tsx:120 |

## Project Roles
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-100 | View project roles list (Default/Custom badge, user count) | Page load | LockedFeatureGuard TEAM (projectRolesEnabled) | project-role/index.tsx:49 |
| PLT-101 | Create custom role (Name + 12-group None/Read/Write matrix) | "New Role" → dialog(create) | disabled "contact sales" unless customRolesEnabled | project-role-dialog.tsx:104 |
| PLT-102 | Set permission level per group (12 groups; Project/Flows disableNone; Flow Status write-only) | Matrix None/Read/Write | disabled in view/default | project-role-dialog.tsx:257 |
| PLT-103 | Edit custom role | Row pencil → dialog(edit) | disabled if DEFAULT | project-roles-table.tsx:118 |
| PLT-104 | View default role (read-only) | Row eye → dialog(disabled) | DEFAULT roles | project-roles-table.tsx:126 |
| PLT-105 | Delete custom role (removes members+invitations) | Row trash → confirm | non-DEFAULT only | project-roles-table.tsx:133 |
| PLT-106 | View users assigned to a role | Row "n users" → Sheet | none | project-roles-table.tsx:102 |
| PLT-107 | Navigate to project team from role-user | User row project link | none | project-role-users-table.tsx:91 |

## Embed
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-108 | View embed stepper (Cloud 4-step / non-Cloud 2-step) | Page load | LockedFeatureGuard SIGNING_KEYS (embeddingEnabled) | embed/index.tsx:75 |
| PLT-109 | Navigate between completed/active steps | Stepper buttons (future locked) | index>activeStepIndex disabled | stepper.tsx:55 |
| PLT-110 | (Cloud) Step 1 — enter embed domain/hostname | HostnameStep → "Save domain" | Cloud only | hostname-step.tsx:49 |
| PLT-111 | (Cloud) Update existing embed domain (confirm) | Summary → "Update" → confirm | Cloud; subdomain exists | hostname-step.tsx:108 |
| PLT-112 | (Cloud) Step 2 — view DNS records to verify (copy) | DnsStep; CopyToClipboardInput | Cloud; PENDING_VERIFICATION | dns-step.tsx:15 |
| PLT-113 | Step — add allowed embed domains (TagInput, validation) | AllowedDomainsStep → "Save" | none | allowed-domains-step.tsx:39 |
| PLT-114 | Step — create signing key (shown-once private key) | "New Signing Key" → Save → Done | none | new-signing-key-dialog.tsx:31 |
| PLT-115 | Delete signing key (invalidates tokens) | Row menu → Delete → confirm | none | signing-keys-step.tsx:114 |

## SSO
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-116 | View SSO providers (Domains, Google, SAML, Email) | Page load | LockedFeatureGuard SSO | sso/index.tsx:53 |
| PLT-117 | Configure allowed auth domains (array; empty=all; enforce flag) | "Enable/Update" → dialog → Save | none | allowed-domain.tsx:41 |
| PLT-118 | Toggle Google SSO | Google switch | disabled while pending | sso/index.tsx:103 |
| PLT-119 | Toggle Email/password login | Email switch | disabled while pending | sso/index.tsx:162 |
| PLT-120 | Configure/Edit SAML 2.0 (2-step wizard) | SAML "Enable/Edit" → dialog | none | saml-dialog.tsx:47 |
| PLT-121 | SAML Step 1 — save SSO domain (update warning) | Domain step → Save/Update | starts on domain if connected/unverified | saml-dialog.tsx:314 |
| PLT-122 | SAML Step 1 — verify domain via TXT DNS (copy, "Verify DNS") | DomainVerificationPanel → Verify DNS | record exists & not dirty | saml-dialog.tsx:227 |
| PLT-123 | SAML Step 1 — proceed to step 2 | "Next" | disabled unless verified | saml-dialog.tsx:322 |
| PLT-124 | SAML Step 2 — enter IDP Metadata + Certificate | SamlStep → Save; Back | disabled unless valid | saml-dialog.tsx:365 |
| PLT-125 | Disable SAML | Wizard "Disable" | shown when connected | saml-dialog.tsx:303 |

## Workers (read-only)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-126 | View worker machines (CPU/RAM/Disk, IP, status, type, version, last-seen) | Page load | none | workers/index.tsx:41 |
| PLT-127 | (Cloud) Upgrade to Dedicated Workers | RequestTrial | Cloud + SHARED fleet | workers/index.tsx:54 |
| PLT-128 | View worker config env vars | WorkerConfigsPopover | none | worker-configs-popover.tsx:13 |
| PLT-129 | View running sandboxes | SandboxesPopover | none | sandboxes-popover.tsx:15 |

## Health (read-only)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-130 | Switch tabs System/Runs/Queue (URL-persist) | Tabs | none | health/index.tsx:100 |
| PLT-131 | Select month (Runs/Queue) | Month Select (6 months) | runs/queue tabs only | health/index.tsx:78 |
| PLT-132 | View System Health checks (Version/Disk/RAM/CPU + changelog) | System tab | none | system-health-tab.tsx:31 |
| PLT-133 | View daily health strip / jump to Runs | DailyHealthStrip "See runs" | none | system-health-tab.tsx:147 |
| PLT-134 | View Runs Health (Jobs done, deltas, status chart, internal errors) | Runs tab | none | runs-tab.tsx:36 |
| PLT-135 | View Queue Health (Running, Queued, stuck jobs) | Queue tab | none | queue-tab.tsx:16 |

## Triggers (read-only)
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-136 | View trigger health per block (status, 14D runs, last results, 24H/7D/14D %) | Page load | none | triggers/index.tsx:78 |

## Event Destinations
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-137 | View event destinations (internal/external, event badges) | Page load | LockedFeatureGuard EVENT_DESTINATIONS | event-destinations/index.tsx:78 |
| PLT-138 | Create destination (events checkboxes + Webhook URL) | "New Destination" → "Create alert" | none | dialog.tsx:79 |
| PLT-139 | Generate handler flow (builds template, imports, sets URL, opens flow) | Dialog → "Generate handler flow" | create-mode; ≥1 event & webhookPrefixUrl | dialog.tsx:144 |
| PLT-140 | Test webhook per selected event | Dialog → "Test webhook" → event | disabled if no URL/invalid/no events | dialog.tsx:108 |
| PLT-141 | Edit destination (URL + event subs) | Row menu → Edit → Save changes | none | event-destination-actions.tsx:39 |
| PLT-142 | Delete destination | Row menu → Delete → confirm | none | event-destination-actions.tsx:50 |
| PLT-143 | Open internal handler flow | Row external-link (internal flows) | parsed internal-flow only | event-destination-row.tsx:88 |

## Chat Analytics
| ID | Capability | Trigger | Gate | File:line |
|----|-----------|---------|------|-----------|
| PLT-144 | View AI chat analytics stat cards | Page load | none (server-gated) | chat-analytics/index.tsx:55 |
| PLT-145 | Set date range From/To | Date inputs | none | chat-analytics/index.tsx:100 |
| PLT-146 | View rollout funnel (landed/chatted/cap) | Auto (cap>0) | none | chat-analytics/index.tsx:131 |
| PLT-147 | Switch Usage/ByOrg/Conversations tabs | Tabs | none | chat-analytics/index.tsx:157 |
| PLT-148 | Change Usage grouping (day/platform/provider/model) | Group-by badges | none | chat-analytics/index.tsx:166 |
| PLT-149 | View by-organization table | By Organization tab | none | chat-analytics/index.tsx:218 |
| PLT-150 | Open conversation detail sheet | Conversations tab → row → Sheet | none | chat-analytics/index.tsx:295 |
