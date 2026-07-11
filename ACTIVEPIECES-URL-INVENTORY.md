# Activepieces URL / Host Inventory — for Intellisper Replacement

> **Purpose.** A complete, categorized inventory of every reference to an Activepieces-owned
> URL, host, registry, or contact identity in the `blockunits` source tree, produced to support
> the brand overhaul (Activepieces → Intellisper / Intelblocks) and to satisfy the hard rule:
> **no communication or connection with any Activepieces URL** — every functional endpoint must
> be repointed to a live Intellisper equivalent, and every cosmetic reference swapped.
>
> **Read-only.** No code was changed to produce this. Verify every `file:line` against the tree
> before acting — the tree moves.
>
> **Scope.** `c:\projects\apprendai\kurvablocks\blockunits` only. Excludes `**/dist/` (compiled
> output, regenerated on build), `node_modules/`, and lockfiles (`bun.lock`) — those are build
> artifacts and must **not** be hand-edited. Does not read `activepieces-clone/` (licensed).

---

## How to use this file

Each reference is classified into one of four handling classes:

| Class | Meaning | Action |
|---|---|---|
| **FUNCTIONAL_ENDPOINT** | Code/CI actually calls or pushes to it at runtime/deploy. **Breaks if the host is dead.** | Repoint to a **live** Intellisper endpoint that actually serves the same contract *before* switching. |
| **INFRA_CONFIG** | Image registry, Helm repo, deploy target, git remote, CI repo-guard, bot identity. | Repoint to Intellisper infra; must exist and be wired before CI/deploy will pass. |
| **ASSET_URL** | Image/logo/badge/video/font fetched from a CDN. Functional-ish but **swappable to any host that serves the asset**. | Host the assets on an Intellisper CDN, then swap the base URL. |
| **COSMETIC_LINK** | A hyperlink/text/email shown to a human (docs, marketing, support, privacy/terms). | Safe to bulk-swap to the Intellisper equivalent; no runtime dependency. |

**Golden rule:** a blind find-replace is unsafe. `cdn.` and `www.` hosts mix ASSET and COSMETIC
uses; `cloud.`/`secrets.`/`sales.` mix FUNCTIONAL and COSMETIC. Handle per-line by class, not per-host.

---

## Distinct hosts found (rollup)

| Host | Classes it appears in | Safe to bulk-swap? |
|---|---|---|
| `cloud.activepieces.com` | FUNCTIONAL + COSMETIC (+ openapi server) | ❌ needs live replacement |
| `secrets.activepieces.com` | FUNCTIONAL (OAuth broker, license verify, OAuth apps list, redirect) | ❌ needs live replacement |
| `sales.activepieces.com` | FUNCTIONAL (contact-sales POST) | ❌ needs live replacement |
| `api.activepieces.com` | FUNCTIONAL (trusted `apAxios` base — verify in server) | ❌ needs live replacement |
| `stg.activepieces.com` | INFRA (staging deploy target) + docs prose | ❌ |
| `*.preview.activepieces.dev` | INFRA (PR preview deploy target) | ❌ |
| `ghcr.io/activepieces` | INFRA (image registry, ~20 CI refs + Helm) | ❌ |
| `activepieces/activepieces` (Docker Hub) | INFRA (image registry) | ❌ |
| `github.com/activepieces/activepieces` | INFRA (git remote + CI repo guards) | ❌ |
| `cdn.activepieces.com` | ASSET (logos, badges, auth bg, showcase videos, Helm icon, docs SDK) | ⚠️ swap after re-hosting assets |
| `www.activepieces.com` | ASSET (customer logos) + many COSMETIC docs links | ⚠️ mixed |
| `activepieces.com` (bare) | ASSET (favicon) + COSMETIC (help/SAML/README) | ⚠️ mixed |
| `template-manager.activepieces.com` | (historical telemetry target — now removed; comment refs) | ❌ verify |
| `community.activepieces.com` | COSMETIC only (docs forum links) | ✅ |
| `demo.activepieces.com` | COSMETIC only (docs env example) | ✅ |
| `canary.` / `<branch>.activepieces.com` | COSMETIC only (handbook prose) | ✅ |
| `feedback.activepieces.com` | COSMETIC (feedback URL const) | ✅ |
| `x.com/activepieces`, `linkedin.com/company/activepieces` | COSMETIC (docs socials) | ✅ |
| Emails `support@ / sales@ / info@ / noreply@activepieces.com` | COSMETIC (contact / default sender) | ✅ |
| `abdulyki+automatedcommits@activepieces.com` | INFRA (bot git-commit identity) | ❌ must change for CI |

---

# FUNCTIONAL_ENDPOINT — breaking if the host is dead

## Backend runtime calls (server / shared) — HIGHEST RISK

### `secrets.activepieces.com`
- `packages/server/api/src/app/app-connection/app-connection-service/oauth2/services/cloud-oauth2-service.ts:32` — `POST https://secrets.activepieces.com/refresh` — **cloud OAuth2 token refresh** (CLOUD_OAUTH2 connections).
- `packages/server/api/src/app/app-connection/app-connection-service/oauth2/services/cloud-oauth2-service.ts:59` — `POST https://secrets.activepieces.com/claim` — **cloud OAuth2 code→token exchange**.
- `packages/server/api/src/app/enterprise/license-keys/license-keys-service.ts:30` — `DEFAULT_LICENSE_KEY_URL = 'https://secrets.activepieces.com'` — **license-key verification/entitlement host** (self-hosted licensing).

### `cloud.activepieces.com`
- `packages/server/api/src/app/app.ts:123` — `url: 'https://cloud.activepieces.com/api'` — cloud API base wired into the app.
- `packages/server/api/src/app/template/community-templates.service.ts:15` — comment: template browse/fetch relayed to `cloud.activepieces.com` — **verify current fetch target** in this service body.

### `template-manager.activepieces.com` / `cloud.activepieces.com` (template telemetry — historical)
- `packages/server/api/src/app/template/template-telemetry/template-telemetry.service.ts:8-9` — comments note view/install/activate events were POSTed to `cloud.activepieces.com` and `template-manager.activepieces.com`. **Confirm whether any live POST remains** (the comment implies it was neutralized; verify the code path).

### `api.activepieces.com` (trusted `apAxios` base)
- Referenced by `.claude/rules/safe-http.md` and `apAxios` usage as a hardcoded trusted host. **Grep `apAxios` / `api.activepieces.com` in `packages/server` before repointing** — it is the base for trusted first-party calls.

## Frontend runtime calls (web)

### `cloud.activepieces.com`
- `packages/web/src/lib/api.ts:15` — `https://cloud.activepieces.com` — `API_BASE_URL` in cloud dev mode; **all `/api` calls hit this**.

### `secrets.activepieces.com`
- `packages/web/src/features/connections/api/oauth-apps.ts:16` — `GET https://secrets.activepieces.com/apps` — list cloud OAuth2 apps.
- `packages/web/src/app/connections/oauth2-connection-settings.tsx:79` — `https://secrets.activepieces.com/redirect` — **OAuth2 redirect URI** for CLOUD_OAUTH2 connections.

### `sales.activepieces.com`
- `packages/web/src/features/billing/api/request-trial-api.ts:13` — `POST https://sales.activepieces.com/submit-inapp-contact-form` — in-app contact-sales form.

## Build/tooling/deploy runtime

### `cloud.activepieces.com`
- `tools/scripts/utils/piece-script-utils.ts:26` — `https://cloud.activepieces.com/api/v1` — `AP_CLOUD_API_BASE`, used by piece-publishing scripts.
- `deploy/pulumi/index.ts:431` — `https://cloud.activepieces.com/api/v1/templates` — injected as a runtime env var into the deployed container (template source URL).
- `.github/workflows/continuous-delivery-cloud.yml:97` — `https://cloud.activepieces.com` — production deploy `environment.url`.

### `stg.activepieces.com`
- `.github/workflows/continuous-delivery-stg.yml:104` — `https://stg.activepieces.com` — staging deploy `environment.url`.

### `*.preview.activepieces.dev`
- `.github/workflows/setup-environment.yml:66` — `https://<branch>.preview.activepieces.dev` — per-PR preview environment URL.

> ⚠️ **Borderline (non-fetch, but breaks silently):**
> - `packages/web/src/features/billing/components/ai-credits/ai-credit-usage.tsx:43` — `window.location.hostname.includes('cloud.activepieces.com')` — **cloud-mode string check**; swapping the deploy hostname without updating this branch silently disables cloud-mode behavior.
> - `docs/openapi.json:1` — documents `https://cloud.activepieces.com/api` as the Production Server; cosmetic as a spec, but any generated client inherits a functional endpoint.

---

# INFRA_CONFIG — registries, deploy targets, git identity

## Image registry: `ghcr.io/activepieces` (GitHub Container Registry)
- `deploy/intellisper-helm/values.yaml:10` — `ghcr.io/activepieces/activepieces` — Helm default image repo.
- `.github/actions/sbom/action.yml:6` — `ghcr.io/activepieces/activepieces:0.83.0` — example image ref.
- `.github/workflows/continuous-delivery-canary.yml:48,52` — `ghcr.io/activepieces/activepieces-cloud:<tag>` — canary push/deploy.
- `.github/workflows/continuous-delivery-cloud.yml:73` — cloud image push.
- `.github/workflows/continuous-delivery-stg.yml:96,183,184` — staging push + retag (`:release-candidate`).
- `.github/workflows/continuous-delivery-rollback.yml:46` — rollback image.
- `.github/workflows/continuous-delivery-rollback-canary.yml:62` — canary rollback image.
- `.github/workflows/continuous-delivery-release.yml:58,99,100,101,109` — release retag + deploy (`activepieces-cloud:release-candidate`, `activepieces:<ver>`/`:latest`).
- `.github/workflows/release-self-hosted.yml:48,74` — self-hosted image push/deploy.
- `.github/workflows/emergency-cloud-deploy.yml:37` — emergency deploy image (`.beta`).
- `.github/workflows/build-cloud-image.yml:37,41` — cloud image build/push (`.beta`).
- `.github/workflows/tag-release-candidate.yml:48,49` — RC retag.

## Image registry: `activepieces/activepieces` (Docker Hub)
- `.github/workflows/continuous-delivery-release.yml:59,97,98` — Docker Hub release push (`:<ver>`/`:latest`).
- `.github/workflows/release-self-hosted.yml:18,47` — Docker Hub manifest check + push.
- `deploy/pulumi/index.ts:87` — `activepieces/activepieces:latest` — default image for Pulumi ECS deploy.

## Git remote / repo guards: `github.com/activepieces/activepieces`
- `docs/docs.json:14` — docs navbar GitHub link.
- `docs/docs.json:572` — docs footer social.
- CI owner-gating `if: github.repository == 'activepieces/activepieces'`: `.github/workflows/ci.yml:13`,
  `generate-translations.yml:10,19,29,39,49,59,69,78`, `release-pieces.yml:18`,
  `remove-environment.yml:10`, `setup-environment.yml:15`, `closed-issue-reply.yaml:12`.
  (Not URLs, but org-identity infra — CI won't run under a new org until these change.)

## npm publish scope: `@activepieces/*`
- `.github/workflows/ci.yml:75,85,94,101` — turbo build/test `--filter` scopes.
- `.github/workflows/release-pieces.yml:50,55,60` — packages published to npm (`@activepieces/shared`, `pieces-common`, `pieces-framework`).
  (Cross-reference the package-scope rename phase — publishing to `@intelblocks/*` requires the npm org.)

## Bot git-commit identity
- `.github/workflows/crowdin-pr-merger.yml:76`, `reusable-finalize-translations-pr.yml:42`, `reusable-generate-translations-shard.yml:50` — `abdulyki+automatedcommits@activepieces.com` — automated-commit author email.

---

# ASSET_URL — images/logos/videos (swap after re-hosting)

## `cdn.activepieces.com`

### Backend-embedded asset URLs (shared / server)
- `packages/shared/src/lib/core/user/badges/index.ts:15,20,25,30,35,40,45,50,55` — `cdn.activepieces.com/badges/*.gif` — 9 gamification badge images.
- `packages/shared/src/lib/ee/secret-managers/index.ts:117,153,183,218` — `cdn.activepieces.com/pieces/{hashi-corp-vault,amazon-secrets-manager,cyberark,1password}.png` — secret-manager provider logos.
- `packages/server/api/src/app/database/migration/postgres/1709052740378-AddPlatformToPostgres.ts:99,100,101` — `cdn.activepieces.com/brand/{logo.svg,full-logo.png,favicon.ico}` — **default platform branding seeded into DB** (Postgres migration).
- `packages/server/api/src/app/database/migration/sqlite/1709051625110-CreateDefaultPlaformSqlite.ts:816,817,818` — same default branding (SQLite migration).
- `packages/server/api/src/app/enterprise/helper/email/email-service.ts:42` — `cdn.activepieces.com/brand/logo.svg` — default email logo.
- `packages/server/api/src/app/flags/theme.ts:69,70,71` — `cdn.activepieces.com/brand/{full-logo.png,logo.svg}` — **default theme** logo/favicon.
- `packages/server/api/src/app/mcp/mcp-server-builder.ts:51` — `cdn.activepieces.com/brand/logo.svg` — MCP server branding icon.

### Frontend asset URLs (web)
- `packages/web/src/features/authentication/components/auth-animation.tsx:12` — CDN base const `cdn.activepieces.com/pieces`.
- `packages/web/src/features/authentication/components/auth-animation.tsx:1194` — `assets/auth-anim-bg.webp`.
- `packages/web/src/features/authentication/components/auth-form-template.tsx:122` — `assets/auth-bg.webp`.
- `packages/web/src/features/agents/ai-providers.ts:13,18,30,38,54,59,77,82,90` — AI-provider logos (`claude, amazon-bedrock, azure-openai, cloudflare-gateway, google-gemini, mistral-ai, openai, openrouter, new-core/text-ai`).
- `packages/web/src/features/agents/ai-model/index.tsx:45` — `pieces/activepieces.png`.
- `packages/web/src/features/pieces/utils/step-utils.tsx:34,40,46,52` — `pieces/new-core/{code,loop,router,empty-trigger}.svg`.
- `packages/web/src/app/builder/step-settings/agent-settings/agent-tools.tsx:26,27,28,29` — `pieces/{youtube,slack,github,notion}.png`.
- `packages/web/src/app/builder/pieces-selector/ai-tab-content/ai-actions-list.tsx:32,33,34,35,36,38,67` — `pieces/new-core/{agent,image-ai,text-ai,utility-ai}.svg`.
- `packages/web/src/app/routes/platform/setup/ai/index.tsx:31` — `pieces/activepieces.png`.
- Showcase videos (`cdn.activepieces.com/videos/showcase/*.mp4`):
  - `packages/web/src/app/routes/platform/setup/templates/index.tsx:217` — `templates.mp4`
  - `packages/web/src/app/routes/platform/setup/connections/index.tsx:318` — `global-connections.mp4`
  - `packages/web/src/app/routes/platform/setup/branding/index.tsx:18` — `appearance.mp4`
  - `packages/web/src/app/routes/platform/security/project-role/index.tsx:56` — `roles.mp4`
  - `packages/web/src/app/routes/platform/security/api-keys/index.tsx:48` — `api-keys.mp4`
  - `packages/web/src/app/routes/platform/projects/index.tsx:355` — `projects.mp4`

### Deploy asset
- `deploy/intellisper-helm/Chart.yaml:4` — `cdn.activepieces.com/brand/logo.svg` — Helm chart `icon`.

## `www.activepieces.com/logos/*` (customer marketing logos)
- `packages/web/src/features/authentication/components/integration-logos-overlay.tsx:4,6,7,8,11,13,14,15,18,20,21,24` — 12 customer logos (`moneygram, redbull, rakuten, docusign, contentful, posthog, roblox, alan, fundingsocieties-sales, plivo, nedap, experience.com`) rendered on the auth screen.

## `activepieces.com/favicon.ico`
- `packages/web/vite.config.mts:15` — `AP_FAVICON`, injected into HTML head at build.

---

# COSMETIC_LINK — human-facing links / emails / text

## Web app UI (`www.activepieces.com`)
- `packages/web/src/app/routes/platform/billing/index.tsx:37` — docs (enterprise-edition).
- `packages/web/src/app/routes/platform/security/embed/index.tsx:141` — docs (embedding overview).
- `packages/web/src/app/routes/platform/infra/health/components/system-health-tab.tsx:91,109,128` — docs (hardware specs).
- `packages/web/src/app/components/account-settings/language-toggle.tsx:119` — docs (i18n).
- `packages/web/src/features/projects/components/create-project-button.tsx:47` — pricing.
- `packages/web/src/features/billing/components/license-key.tsx:61` — pricing.
- `packages/web/src/app/components/request-trial.tsx:67` — sales.
- `packages/web/src/features/pieces/components/install-piece-dialog.tsx:177` — docs (build-pieces).
- `packages/web/src/app/builder/piece-properties/text-input-with-mentions/components/function-search-popover.tsx:112` — docs (formulas).

## Web app UI (`activepieces.com`)
- `packages/web/src/app/components/help-and-feedback.tsx:28` — `activepieces.com/docs`.
- `packages/web/src/app/routes/platform/security/sso/saml-dialog.tsx:407` — `activepieces.com/docs/security/sso` (SAML setup text).

## Web feedback / support consts (shared)
- `packages/shared/src/lib/core/feedback-url.ts:1` — `feedbackUrl = 'https://feedback.activepieces.com'`.
- `packages/shared/src/lib/core/support-url.ts:1` — `supportUrl = 'https://community.activepieces.com'`.

## Backend cosmetic links (server)
- `packages/server/api/src/app/app.ts:144` — `www.activepieces.com/docs` (docs link).
- `packages/server/api/src/app/flags/flag.service.ts:198,204` — `www.activepieces.com/{privacy,terms}` — privacy/terms flag values shown in UI.
- `packages/server/api/src/app/helper/system-validator.ts:241,257,265,283,293` — `www.activepieces.com/docs/install/...` — doc links in config-validation error messages.
- `packages/server/api/src/app/mcp/mcp-server-builder.ts:47` — `websiteUrl: 'https://activepieces.com'`.
- `packages/server/api/src/app/enterprise/helper/email/email-service.ts:77` — `noreply@activepieces.com` — **default SMTP sender** (fallback when `SMTP_SENDER_EMAIL` unset; cosmetic but customer-visible).

## i18n translation strings (`packages/web/public/locales/*`)
- `support@activepieces.com` (billing support) — `:766` in en, de, es, fr, ja, nl, pt, zh (zh-TW empty).
- `activepieces.com/docs/security/sso` — `:1079` en/de/es/fr/ja/nl/pt/zh/zh-TW; `ar:659`.
- `www.activepieces.com/docs/security/sso` — `ru:643`, `ar:654`.
- `sales@activepieces.com` — `ar:727`.

## docs/ site config (`docs/docs.json` — Mintlify)
- `:18` — `www.activepieces.com/pieces`; `:24` — `www.activepieces.com/plans`; `:562` — `www.activepieces.com` (logo href); `:571` — `x.com/activepieces`; `:573` — `linkedin.com/company/activepieces`.

## docs/ prose (`*.mdx`) — grouped by host
- **`cdn.activepieces.com`** (example asset URLs): `embedding/embed-builder.mdx:24`; `embedding/sdk-changelog.mdx:22,27,31,39,44,54,66,74`; `build-pieces/building-pieces/piece-definition.mdx:45`, `create-trigger.mdx:118`, `create-action.mdx:86`, `piece-authentication.mdx:27`; `build-pieces/misc/create-new-ai-provider.mdx:49,75`.
- **`cloud.activepieces.com`** (examples/links): `embed-builder.mdx:67`; `predefined-connection.mdx:32`; `install/overview.mdx:101`; `build-pieces/building-pieces/start-building.mdx:40`, `create-trigger.mdx:62`, `create-action.mdx:55`; `build-pieces/misc/publish-piece.mdx:28,44,53`; `flows/known-limits.mdx:9`; `handbook/engineering/playbooks/canary-deployment.mdx:119,128`.
- **`www.activepieces.com`** (doc links): `admin-guide/security/practices.mdx:56`; `_snippets/enterprise-feature.mdx:2`; `admin-guide/guides/sso.mdx:285`; `admin-guide/guides/setup-ai-providers.mdx:7`; `overview/welcome.mdx:20`; `install/overview.mdx:12`; `install/options/helm.mdx:193`; `install/configuration/breaking-changes.mdx:114,145`; `install/configuration/environment-variables.mdx:19,24`; `install/configuration/overview.mdx:38`; `deploy/pulumi/README.md:3`.
- **`community.activepieces.com`** (forum): `install/configuration/breaking-changes.mdx:144,219`; `handbook/customer-support/overview.mdx:17`; `handbook/engineering/onboarding/on-call.mdx:45`; `handbook/engineering/onboarding/downtime-incident.mdx:26`.
- **`demo.activepieces.com`**: `install/configuration/environment-variables.mdx:23` (`AP_INTERNAL_URL` example).
- **`stg.` / `canary.` / `<branch>.activepieces.com`** (handbook infra prose): `handbook/engineering/playbooks/releases.mdx:12,23,24,25,26`; `handbook/engineering/playbooks/infrastructure.mdx:23,24`.
- **Contact emails** (`sales@ / support@`): `about/license.mdx:11`; `about/i18n.mdx:29`; `endpoints/overview.mdx:8`; `install/configuration/overview.mdx:35`; onboarding prose `handbook/engineering/onboarding/onboarding-check-list.mdx:14`.

## docs/ API spec (`docs/openapi.json`)
- `:1` — server `https://cloud.activepieces.com/api` (Production Server) + `www.activepieces.com/docs`. See the borderline note under FUNCTIONAL.

## README + CI notes + CoC
- `README.md:5` — `activepieces.com`; `:27,31,35,94,101,105,118,138` — `www.activepieces.com/{docs,pieces,pricing,...}`.
- `.github/workflows/continuous-delivery-release.yml:122` — `www.activepieces.com/docs/install/guides/rollback` (auto-release-notes text).
- `.github/CODE_OF_CONDUCT.md:74,79,89` — `info@activepieces.com`.

## Internal planning notes (NOT shipped — informational)
- `docs/rewrite/platform-cleanroom-build.md:1492,1792`, `docs/rewrite/ONBOARDING-clean-room.md:97`, `docs/rewrite/ee-api-contract-map.md:247` — reference `secrets.activepieces.com` / `activepieces.com` in clean-room planning prose. No live links; update for consistency only.

---

## Recommended order of operations

1. **Stand up Intellisper equivalents FIRST** for every FUNCTIONAL/INFRA host: cloud API, `secrets`
   OAuth+license service, `sales` form endpoint, image registries, deploy targets, npm org, bot
   identity. Nothing can be repointed until its replacement serves the same contract.
2. **Re-host all CDN assets** (badges, brand logos, provider logos, auth backgrounds, showcase
   videos, favicon) on an Intellisper CDN, then swap ASSET base URLs — including the two **DB
   migrations** that seed default branding and the default `theme.ts`/email logo (existing rows
   won't change; only new installs pick up the new defaults unless a data migration updates them).
3. **Bulk-swap COSMETIC** links/emails/docs last — no runtime dependency; safe once the marketing/
   docs sites exist.
4. **Watch the two silent-break spots:** the `hostname.includes('cloud.activepieces.com')` cloud-mode
   check and the `openapi.json` production-server URL.

> Every `file:line` here must be re-verified before edit — this inventory is a map, not the territory.
