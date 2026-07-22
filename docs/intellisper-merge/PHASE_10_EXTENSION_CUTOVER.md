# Phase 10 — Extension Cutover to the blockunits API

The Intellisper Chrome extension (`/extension`, MV3, React 19 + Vite + CRXJS) was repointed from the
old standalone `api.apprendai.com` server to this blockunits Fastify API. This is what "extension
cutover" in the merge plan meant: connect the real extension to the merged API for the first time.

## What made this more than a config change

The extension's client (`src/shared/api-client.ts`) spoke a different contract on every axis:

| Axis | Old server (extension expected) | blockunits (reality) |
|---|---|---|
| Agent paths | `/agent/*` | `/api/v1/browser-agent/*` |
| Auth paths | `/auth/login`, `/auth/register`, `/auth/google`, `/auth/refresh` | `/v1/authentication/sign-in`, `/sign-up`, `/authn/federated/*` |
| Token model | access + refresh, silent refresh on 401 | ONE 7-day JWT, no refresh |
| `projectId` | never sent | REQUIRED in every browser-agent body/query |
| Auth response | `{accessToken, refreshToken, user}` | `{token, projectId, ...user}` |
| Google | id-token endpoint | only auth-code flow existed |
| Billing/subscription | `/intellisper/billing/*` | didn't exist |
| Conversation history | `/agent/conversations` | didn't exist |

Two things were already compatible and saved significant work: the **SSE event contract is identical**
(same `type` union, same `data:` framing, same `X-Intellisper-Protocol: 1`), and **CORS is
`origin: '*'`**, so a `chrome-extension://` origin is accepted with no config.

## Server changes (all ADDITIVE — nothing existing modified)

1. **Google id-token endpoint** — `POST /api/v1/authn/federated/google-id-token`. Accepts a Google
   `id_token` (the implicit flow the extension uses via `chrome.identity`), verifies it against
   Google's JWKS with a NEW `GOOGLE_CLIENT_ID_INTELLISPER` audience (distinct from the web
   `GOOGLE_CLIENT_ID`), and mints a session via the existing `federatedAuthn` path. Reuses the exact
   `verifyIdToken` logic the auth-code flow already uses (exposed as `verifyClientIdToken`).
   Deny-by-default when the env var is unset; rate-limited like the other authn entrypoints. Registered
   CLOUD + ENTERPRISE (it rides the already-registered `federatedAuthModule`).
2. **Conversation controller** — `browser-agent-conversation.controller.ts` + service:
   `GET /conversations`, `GET /conversations/:id/messages`, `DELETE /conversations/:id` (soft-delete).
   Every read goes through `agentScope.ownerFilter`; the by-parent message read carries the documented
   `agentScope-exempt` marker. The entities already existed (written by the runtime); this adds the
   read/delete surface, which the merge plan had explicitly deferred to Phase 10.
3. **Subscription read** — `GET /browser-agent/usage/subscription` → `{ plan, status, browserAgentEnabled }`,
   derived read-only from the platform plan.
4. **Incidental fix** — a latent zod-4 `.hostname()` type error in `authn-sso-saml-service.ts`
   (unrelated SSO code) surfaced during the shared rebuild and was fixed (regex hostname check).

New env prop: `GOOGLE_CLIENT_ID_INTELLISPER` (optional — unset ⇒ extension Google sign-in disabled,
email/password still works).

## Extension changes

- **`src/shared/api-client.ts` fully rewritten** — every path repointed; `projectId` threaded into
  every browser-agent call (stored from the auth response); single-token model (no refresh — a 401
  that isn't transient ⇒ friendly re-login); onboarding→`POST /platforms` with `productScope=BROWSER`
  when a brand-new user gets an onboarding token; response-shape mappers (server `routines`↔client
  `workflows`, `created`↔`createdAt`, usage/subscription); request timeouts on every fetch; stream
  reader always released. **Public method signatures were preserved**, so the ~1000-line background
  orchestration, the automation runner, and the UI needed no changes.
- **Auth/config** — `google-auth.ts` comment corrected to the new endpoint; `.env` / `.env.example`
  repointed to the blockunits host; Settings plan labels updated to the real blockunits tiers
  (agent/studio/complete × free/starter/pro + team + enterprise) and metric labels to the server's
  `AgentUsageMetric` keys; dashboard links centralised.
- **402 handling** — the client maps a `FEATURE_DISABLED` (402) into a clear "upgrade your plan"
  message; the SSE `entitlement_required`/`usage_limit_reached`/`budget_exceeded` events already
  render an upgrade card.
- **UI refresh** — token-level uplift in `styles.css` (cooler graphite, deeper amber accent, softer
  layered shadows), a global keyboard `:focus-visible` ring, and `prefers-reduced-motion` support.
  Applies to both the side panel and the settings page (they share the stylesheet).

## Contract parity — every client call maps to a real server route (28/28)

| Client call | Server route |
|---|---|
| `POST /authentication/sign-in` / `/sign-up` | `/v1/authentication/sign-in` / `/sign-up` |
| `POST /authn/federated/google-id-token` | `/v1/authn/federated/google-id-token` *(new)* |
| `POST /platforms` (onboarding) | `/v1/platforms` |
| `POST /browser-agent/chat` (SSE) | `/v1/browser-agent/chat` |
| `POST /browser-agent/runs/:id/{observation,approve,reject,expand,decline-expand}` | same |
| `GET /browser-agent/conversations` | `/v1/browser-agent/conversations` *(new)* |
| `GET /browser-agent/conversations/:id/messages` | same *(new)* |
| `DELETE /browser-agent/conversations/:id` | same *(new)* |
| `GET/DELETE /browser-agent/memory/facts[/:id]` | `/v1/browser-agent/memory/facts` |
| `POST /browser-agent/grammar` | `/v1/browser-agent/grammar` |
| `GET/DELETE /browser-agent/routines[...]`, `from-run/:id`, `runs/history` | `/v1/browser-agent/routines/*` |
| `POST/GET /browser-agent/automation/batches[...]`, `/upload`, `/:id/{cancel,retry-failed}` | `/v1/browser-agent/automation/*` |
| `POST/GET/PATCH/DELETE /browser-agent/automation/schedules[...]`, `/:id/enabled` | same |
| `POST /browser-agent/automation/presence/heartbeat`, `GET /work/claim` | same |
| `GET /browser-agent/usage`, `/usage/subscription` | `/v1/browser-agent/usage` + `/subscription` *(new)* |
| `POST /browser-agent/files` | `/v1/browser-agent/files` |

## Verification done

- Server: API typecheck at **baseline 27** (0 in new code); auth **14/14** (incl. 3 new Google
  id-token tests: deny-by-default, correct-audience, onboarding); browser-agent **170/170** (incl. the
  agentScope enforcement gate over the new conversation reads).
- Extension: `tsc --noEmit` **0 errors**; full `vite build` **✓** (main + content bundles).
- Contract parity: the 28-row table above, cross-checked against the registered server routes.

## Tenancy / edition / subscription in the extension — now correct

- The extension provisions a browser-agent platform on sign-up/Google (`productScope=BROWSER`), so a
  new user lands on the free Agent tier.
- Every call is `projectId`-scoped to a project the user is a member of — the server enforces
  membership; the extension never sends a tenant id it could tamper with (the id comes from the auth
  response).
- A platform without the agent on its plan gets **402 FEATURE_DISABLED**, surfaced as an upgrade
  prompt. Per-plan caps surface in-stream as upgrade cards, and the settings usage meter reads the
  real `/usage` caps.

## The one remaining step — live E2E (needs your environment)

Everything that can be verified from the repos is green. What remains is a genuine end-to-end run,
which requires a loaded Chrome extension + a running blockunits host + real Google OAuth:

1. Set `GOOGLE_CLIENT_ID_INTELLISPER` on the server; set `VITE_API_BASE_URL` (+ `VITE_GOOGLE_CLIENT_ID_INTELLISPER`)
   in the extension `.env`; `npm run build` the extension and load `dist/` unpacked.
2. Add the extension's redirect URI (`https://<EXT_ID>.chromiumapp.org/`) to the Google client.
3. Walk: sign-up (email + Google) → chat with a page action → approve a consequential action →
   a research expand → save a routine → run a batch → check the settings usage/subscription cards →
   sign out / re-login. Confirm 402 shows the upgrade prompt on a plan without the agent.
