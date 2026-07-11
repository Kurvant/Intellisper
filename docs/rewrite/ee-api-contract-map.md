# EE API Contract Map — Derived from the MIT Frontend Only

> **PROVENANCE & SCOPE — READ FIRST.**
>
> Every endpoint below was read **exclusively from permissively-licensed (MIT) source**:
> the frontend client layer under `packages/web/src/**` and the shared types package
> `packages/shared` (both are outside the two commercially-licensed paths
> **No commercially-licensed backend source was read to
> produce this document.**
>
> This makes the document a **license-clean input**: it is the externally-observable API
> contract a client already relies on, which is functional/interface information, not
> protected backend expression. The clean team MAY use it. They should still confirm each
> line against the MIT frontend file cited, and resolve field-level shapes from the named
> `packages/shared` types (also MIT) themselves.
>
> **WHAT THIS DOCUMENT IS NOT — to avoid misleading the implementer:**
> 1. It is **not a behavior spec.** The frontend reveals method + path + the *named*
>    request/response types. It does **not** reveal server-side validation, authorization
>    rules, side effects, transaction boundaries, or internal logic. Those must come from
>    the (lawyer-sanitized) behavioral capability spec and public protocol specs — not from
>    reading the commercial backend.
> 2. It is **not exhaustive for every EE feature.** Several EE features have **no frontend
>    caller** (they are IdP-facing, external-system-facing, or have no admin UI). For those,
>    the frontend cannot document the contract. They are listed explicitly in
>    §"Features NOT derivable from the frontend" — **do not invent endpoints for them.**
> 3. Field-level shapes are stated only where the named `packages/shared` type makes the
>    role obvious. Where a shape is not yet resolved, this doc says **"shape = `TypeName`
>    (resolve from packages/shared)"** rather than guessing. Treat any unresolved shape as
>    a TODO for the clean team to read from the MIT shared package — **not** to infer from
>    the backend.
>
> Method/path are quoted verbatim from the client calls (these are interoperability facts).
> Type *names* are the MIT type identifiers the client imports; reproducing your own type
> with the same fields is fine (data formats needed for interoperability are not protected),
> but you need not keep the names.

---

## Conventions

- `GET/POST/DELETE <path>` — verbatim from the MIT client.
- `→ Type` — response type the client expects (MIT name).
- `body: Type` / `query: Type` — request shape the client sends (MIT name).
- `SeekPage<T>` — the platform's standard cursor-paginated envelope (MIT shared type:
  `{ data: T[]; next: cursor|null; previous: cursor|null }`).
- "Source:" cites the MIT file the line was read from.
- All paths are under the API base (the frontend prefixes them with `/api`). Shown as the
  client writes them (e.g. `/v1/...`).

---

## 1. Platform / Tenancy core
*Source: `packages/web/src/api/platforms-api.ts`, `packages/web/src/api/platform-user-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/v1/platforms` | `{ name: string }` | `AuthenticationResponse` |
| GET | `/v1/platforms/{platformId}` | — | `PlatformWithoutSensitiveData` |
| POST | `/v1/platforms/{platformId}` | `UpdatePlatformRequestBody` | `PlatformWithoutSensitiveData` |
| POST | `/v1/platforms/{platformId}` | `multipart/form-data` (branding assets) | `PlatformWithoutSensitiveData` |
| DELETE | `/v1/platforms/{platformId}` | — | `void` (account/platform deletion) |

**Platform users (org user admin)** — *Source: `platform-user-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/users` | query: `ListUsersRequestBody` | `SeekPage<UserWithMetaInformation>` |
| POST | `/v1/users/{id}` | `UpdateUserRequestBody` | `User` |
| DELETE | `/v1/users/{id}` | — | (deletion) |

> **Notes (license-clean observations):**
> - The single `POST /v1/platforms/{id}` endpoint is reused for: general settings
>   (`UpdatePlatformRequestBody`), **branding** (multipart form upload), and **piece
>   governance** — toggling `filteredPieceNames` and `pinnedPieces` are just field updates
>   on this same endpoint (Source: `platform-admin/hooks/branding-hooks.ts`,
>   `platform-admin/hooks/platform-pieces-hooks.ts`). So "branding" and "piece
>   filtering/pinning" are **not** separate endpoints in the frontend — they are fields on
>   the platform update.
> - `PlatformWithoutSensitiveData` is the org/tenant policy object the UI reads (branding,
>   auth toggles, plan flags, piece governance lists). Resolve its full field set from the
>   MIT shared type — it defines the org-level tenant configuration surface.

## 2. Roles & permissions (custom roles)
*Source: `packages/web/src/features/platform-admin/api/project-role-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/project-roles` | — | `SeekPage<ProjectRole>` |
| GET | `/v1/project-roles/{id}` | — | `ProjectRole` |
| POST | `/v1/project-roles` | `CreateProjectRoleRequestBody` | `ProjectRole` |
| POST | `/v1/project-roles/{id}` | `UpdateProjectRoleRequestBody` | `ProjectRole` |
| DELETE | `/v1/project-roles/{id}` | — | `void` |
| GET | `/v1/project-roles/{id}/project-members` | query: `ListProjectMembersForProjectRoleRequestQuery` | `SeekPage<ProjectMemberWithUser>` |

> `ProjectRole` carries the role's permission set (resolve fields from shared). This is the
> custom-roles CRUD surface.

## 3. Workspace membership
*Source: `packages/web/src/features/members/api/project-members-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/project-members` | query: `ListProjectMembersRequestQuery` | `SeekPage<ProjectMemberWithUser>` |
| POST | `/v1/project-members/{memberId}` | `UpdateProjectMemberRoleRequestBody` | `void` |
| DELETE | `/v1/project-members/{id}` | — | `void` |

> **Gap (honest):** member *invitation* is not in this file. Invitations are a separate
> surface (user-invitations) that is MIT/core, not under `ee/`; confirm its endpoints from
> its own MIT api file before assuming. This table covers list/update-role/remove only.

## 4. SSO — SAML domain configuration (admin side)
*Source: `packages/web/src/features/platform-admin/api/saml-sso-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/v1/authn/saml/discover` | `{ domain: string }` | `{ platformId: string \| null }` |
| POST | `/v1/authn/saml/sso-domain` | `{ ssoDomain: string \| null }` | `{ ssoDomain, ssoDomainVerification }` |
| POST | `/v1/authn/saml/sso-domain/verify` | `{}` | `{ ssoDomain, ssoDomainVerification }` |

> **Gap (critical, honest):** these are only the **admin domain-config** calls. The actual
> **SAML login/ACS callback flow** (IdP → service-provider assertion consumption) is
> **IdP/browser-facing, not called by this frontend api layer** — so its contract is **NOT
> derivable here.** Build the login/ACS flow from the **public SAML 2.0 spec**, not from
> this document.

## 5. Signing keys (embed/SSO token signing)
*Source: `packages/web/src/features/platform-admin/api/signing-key-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/signing-keys` | — | `SeekPage<SigningKey>` |
| POST | `/v1/signing-keys/` | `AddSigningKeyRequestBody` | `AddSigningKeyResponse` |
| DELETE | `/v1/signing-keys/{keyId}` | — | `void` |

> `AddSigningKeyResponse` is expected to be the only time private material is returned
> (typical "show secret once" pattern) — confirm field shape from shared; do not assume.

## 6. API keys (management API access)
*Source: `packages/web/src/features/platform-admin/api/api-key-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/api-keys` | — | `SeekPage<ApiKeyResponseWithoutValue>` |
| POST | `/v1/api-keys/` | `CreateApiKeyRequest` | `ApiKeyResponseWithValue` |
| DELETE | `/v1/api-keys/{keyId}` | — | `void` |

> Note the two response variants: list returns **without** the secret value; create returns
> **with** value (show-once). This split is part of the contract.

## 7. Audit logs
*Source: `packages/web/src/features/platform-admin/api/audit-events-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/audit-events` | query: `ListAuditEventsRequest` | `SeekPage<ApplicationEvent>` |

> Read surface only (the frontend lists events). Event *production* is server-internal and
> not derivable from the frontend.

## 8. Embed subdomain (custom hostname for embedding)
*Source: `packages/web/src/features/platform-admin/api/embed-subdomain-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/embed-subdomain` | — | `EmbedSubdomain \| null` |
| POST | `/v1/embed-subdomain` | `GenerateEmbedSubdomainRequest` | `EmbedSubdomain` |

> The CDN/edge provisioning behind this is server-side and not derivable here.

## 9. Managed authentication (embedding end-user tokens)
*Source: `packages/web/src/features/authentication/api/managed-auth-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/v1/managed-authn/external-token` | `ManagedAuthnRequestBody` | `AuthenticationResponse` |

> This is the embed handshake endpoint: a host-signed external token is exchanged for an
> AP session. Pair with §5 (signing keys) and the package for embedding (§16).

## 10. Billing / plans / AI credits
*Source: `packages/web/src/features/billing/api/billing-plans-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/platform-billing/info` | — | `PlatformBillingInformation` |
| POST | `/v1/platform-billing/portal` | — | `string` (portal URL) |
| POST | `/v1/platform-billing/update-active-flows-addon` | `UpdateActiveFlowsAddonParams` | `string` |
| POST | `/v1/platform-billing/create-checkout-session` | `CreateSubscriptionParams` | `string` (checkout URL) |
| POST | `/v1/platform-billing/ai-credits/create-checkout-session` | `CreateAICreditCheckoutSessionParamsSchema` | `{ stripeCheckoutUrl: string }` |
| POST | `/v1/platform-billing/ai-credits/auto-topup` | `UpdateAICreditsAutoTopUpParamsSchema` | `{ stripeCheckoutUrl?: string }` |

> **Vendor caveat:** these wrap a payment processor (the shapes reference a Stripe-style
> checkout URL). You are building your **own** billing — treat these as a reference for
> *what UI actions exist* (subscribe, portal, add-on, AI-credit purchase, auto-top-up), not
> as a processor integration to copy. The processor webhook side is server-only and not
> derivable here.

## 11. AI providers (managed model access)
*Source: `packages/web/src/features/platform-admin/api/ai-provider-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/ai-providers` | — | `AIProviderWithoutSensitiveData[]` |
| GET | `/v1/ai-providers/{provider}/models` | — | `AIProviderModel[]` |
| POST | `/v1/ai-providers` | `CreateAIProviderRequest` | `void` |
| POST | `/v1/ai-providers/{providerId}` | `UpdateAIProviderRequest` | `void` |
| DELETE | `/v1/ai-providers/{provider}` | — | `void` |

> The actual model-proxy/credit-decrement runtime is server-internal (not derivable). This
> is only the provider-config admin surface. *(Per project direction: default to Anthropic
> Claude — latest Opus/Sonnet/Haiku — when you build the proxy.)*

## 12. Worker machines (capacity visibility)
*Source: `packages/web/src/features/platform-admin/api/workers-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/worker-machines` | — | `WorkerMachineWithStatus[]` |

> Read-only visibility. Worker-group routing/assignment is server-side and not derivable.

## 13. Connections — global (org-shared)
*Source: `packages/web/src/features/connections/api/global-connections.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/global-connections` | query: `ListGlobalConnectionsRequestQuery` | `SeekPage<AppConnectionWithoutSensitiveData>` |
| POST | `/v1/global-connections` | `UpsertGlobalConnectionRequestBody` | `AppConnectionWithoutSensitiveData` |
| POST | `/v1/global-connections/{id}` | `UpdateGlobalConnectionValueRequestBody` | `AppConnectionWithoutSensitiveData` |
| DELETE | `/v1/global-connections/{id}` | — | `void` |

> Global connections carry `projectIds[]` + `preSelectForNewProjects` (the attach-to-many
> behavior). Note: responses are "without sensitive data" — credential material is never
> returned to the client. Plan-gated in UI via `platform.plan.globalConnectionsEnabled`.

## 14. Connections — OAuth apps (bring-your-own OAuth)
*Source: `packages/web/src/features/connections/api/oauth-apps.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/oauth-apps` | query: `ListOAuth2AppRequest` | `SeekPage<OAuthApp>` |
| POST | `/v1/oauth-apps` | `UpsertOAuth2AppRequest` | `OAuthApp` |
| DELETE | `/v1/oauth-apps/{credentialId}` | — | `void` |

> ⚠️ **Relay caveat (not a contract to reproduce):** the same MIT file also calls a
> hardcoded external host `https://secrets.activepieces.com/apps` to fetch *cloud* OAuth app
> client IDs. That is an ActivePieces-hosted relay, **not** part of your API — do not
> reproduce it; if you want managed cloud OAuth apps, point at your own host. (Consistent
> with the telemetry/relay removal work already done elsewhere.)

## 15. Secret managers (external secret backends)
*Source: `packages/web/src/features/secret-managers/api/secret-managers-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/secret-managers` | query: `{ projectId? }` | `SeekPage<SecretManagerConnectionWithStatus>` |
| POST | `/v1/secret-managers` | `ConnectSecretManagerRequest` | `SecretManagerConnectionWithStatus` |
| POST | `/v1/secret-managers/{id}` | `ConnectSecretManagerRequest` | `SecretManagerConnectionWithStatus` |
| DELETE | `/v1/secret-managers/{id}` | — | `void` |
| DELETE | `/v1/secret-managers/cache` | query: `{ connectionId? }` | `void` (cache clear) |

> Provider adapters (AWS/Vault/etc.) are server-side; build them from each vendor's public
> SDK. This is the config/connection-status admin surface only.

## 16. Project releases + Git sync (versioning / env promotion)
*Source: `packages/web/src/features/project-releases/api/project-release-api.ts`,
`.../git-sync-api.ts`*

**Releases**

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/project-releases` | query: `ListProjectReleasesRequest` | `SeekPage<ProjectRelease>` |
| GET | `/v1/project-releases/{releaseId}` | — | `ProjectRelease` |
| POST | `/v1/project-releases` | `CreateProjectReleaseRequestBody` | `ProjectRelease` |
| POST | `/v1/project-releases/diff` | `DiffReleaseRequest` | `ProjectSyncPlan` |
| DELETE | `/v1/project-releases/{id}` | — | `void` |

**Git sync**

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/git-repos?projectId=…` | — | `SeekPage<GitRepo>` (client takes `[0]`) |
| POST | `/v1/git-repos` | `ConfigureRepoRequest` | `GitRepo` |
| POST | `/v1/git-repos/{repoId}/push` | `PushGitRepoRequest` | `void` |
| DELETE | `/v1/git-repos/{repoId}` | — | `void` |

> `ProjectSyncPlan` is the computed diff the UI renders before applying. The actual VCS
> push/pull and state-apply logic is server-side (not derivable). Build the diff/apply
> engine from your own design + the public git protocol/libraries.

## 17. Alerts
*Source: `packages/web/src/features/alerts/api/alerts-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/alerts` | query: `ListAlertsParams` | `SeekPage<Alert>` |
| POST | `/v1/alerts` | `CreateAlertParams` | `Alert` |
| DELETE | `/v1/alerts/{alertId}` | — | `void` |

> `Alert` carries `{ channel, projectId, receiver }`-style fields (resolve from shared).
> Delivery is via the email subsystem (server-side).

## 18. AI chat / agent conversations
*Source: `packages/web/src/features/chat/lib/chat-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/v1/chat/conversations` | `CreateChatConversationRequest` | `ChatConversation` |
| GET | `/v1/chat/conversations?limit=&cursor=` | — | `SeekPage<ChatConversation>` |
| GET | `/v1/chat/conversations/{id}` | — | `ChatConversation` |
| POST | `/v1/chat/conversations/{id}` | `UpdateChatConversationRequest` | `ChatConversation` |
| DELETE | `/v1/chat/conversations/{id}` | — | `void` |
| GET | `/v1/chat/conversations/{id}/messages` | — | `{ data: PersistedChatMessage[] \| ChatHistoryMessage[] }` |
| POST | `/v1/chat/conversations/{id}/messages` | `{ content, runId?, files?[] }` | `{ conversationId, runId? }` |
| POST | `/v1/chat/conversations/{id}/cancel` | — | `void` |
| GET | `/v1/chat/conversations/{id}/connections?pieceName=` | — | `ConnectionOption[]` |
| GET | `/v1/chat/conversations/{id}/pending-gate` | — | `{ gateId, toolName, displayName, toolInput } \| null` |
| POST | `/v1/chat/tool-approvals/{gateId}` | `{ approved: boolean, payload? }` | `void` |

> The **approval-gate** semantics (pending-gate + tool-approvals) are visible here as a
> contract: the agent pauses on a gated tool, the UI fetches the pending gate, the user
> approves/denies. The internal agent loop, compaction, and history hygiene are server-side
> (not derivable) — build from your own design.

## 19. MCP server (platform setup)
*Source: `packages/web/src/app/routes/platform/setup/mcp/platform-mcp-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/v1/mcp-server` | — | `McpServer` |
| POST | `/v1/mcp-server` | (request body) | `McpServer` |

> MCP is partly core/MIT; included for completeness of the platform-setup surface.

## 20. License key (verify only — REPLACE)
*Source: `packages/web/src/api/platforms-api.ts`*

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/v1/license-keys/verify` | `{ platformId, licenseKey }` | `void` |

> Only the *verify* call is in the frontend. **Do not reproduce** ActivePieces' license
> validation — design your own entitlement mechanism. Listed for completeness.

---

## Features NOT derivable from the frontend (do NOT invent endpoints)

These EE features have **no MIT frontend API caller** (verified by search across
`packages/web/src`). The frontend cannot tell you their contract — so this document
deliberately leaves them blank. Build from public specs / your own design, **not** from the
commercial backend.

| Feature | Why no frontend contract | Where the real contract comes from |
|---|---|---|
| **SCIM 2.0 provisioning** | IdP-facing protocol; the IdP (not this UI) calls it. Only a billing *label* mentions SCIM. | Public **SCIM 2.0** RFCs (7642/7643/7644). |
| **SAML login / ACS callback** | IdP/browser-facing; only admin domain-config is in the UI (§4). | Public **SAML 2.0** spec. |
| **Custom domains** (beyond embed-subdomain) | No `/v1/custom-domains` caller found in frontend. | Your design + CDN provider public API. |
| **Platform webhooks** | No `platform-webhooks` caller found in frontend. | Your design. |
| **App credentials** (managed embedding creds) | No `/v1/app-credentials` caller found. | Your design (pairs with embed/managed-authn). |
| **Connection keys** | No `/v1/connection-keys` caller found (was partial upstream). | Your design. |
| **AppSumo redemption** | No frontend caller found. | Drop unless needed. |
| **Console/usage metering** | Absent in this fork entirely. | Your design if wanted. |
| **OTP flows** | Verification/reset are auth flows; confirm whether a core/MIT auth api file calls them before assuming an EE contract. | Your design + email subsystem. |
| **Federated/Google SSO callback** | OAuth redirect/callback is browser/provider-facing. | Public **OAuth2/OIDC** specs. |

> If you need any of these, their *behavior* is described (license-clean) in the companion
> capability spec; their *wire contract* is yours to define (or comes from the public
> standard), since the MIT frontend does not contain it.

---


## How the clean team should use this map

1. Treat each table as the **target API surface** to implement (method + path + request/
   response shape). Matching these contracts is what keeps the **MIT frontend working
   unchanged** against your new backend.
2. For field-level shapes, open the named `packages/shared` type (MIT) and define your own
   equivalent. You may match field names/formats where needed for the frontend to work
   (interoperability) — that is permitted.
3. For everything in **"NOT derivable from the frontend,"** use public protocol specs or
   your own design — never the commercial backend.
4. For **server-internal behavior** (auth checks, validation, side effects, transactions),
   use the lawyer-sanitized behavioral capability spec — **not** this document and **not**
   the commercial source.
5. Re-verify any line against the cited MIT file before relying on it; this document is a
   reading aid, not a substitute for the source of truth.

*End. This document was produced solely from MIT-licensed frontend + shared sources.*
