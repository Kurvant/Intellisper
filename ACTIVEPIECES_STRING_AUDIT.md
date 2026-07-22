# Remaining `activepieces` strings in the docs — audit & decisions

Scope: the 49 `activepieces` occurrences left in the **ported** docs (`docs-site/docs/**`) after the
canonical-URL rebrand. `docs/` (the legacy Mintlify source) is untouched until the C6 cutover; all
fixes live in the port script `docs/rewrite/port-content.cjs` so they survive a re-port.

**Key fact:** none of these strings is referenced by application code — they are text in documentation.
Correcting them cannot break the codebase. The risk is the opposite: several currently document the
**wrong value** (most importantly, install commands that pull *Activepieces'* Docker image).

---

## 🔴 CRITICAL — docs currently install / link to the wrong product (fix now)

### Docker image name — `activepieces/activepieces` → `ghcr.io/kurvant/intellisper`
This repo builds and publishes **`ghcr.io/kurvant/intellisper`** (docker-compose.yml:10,27) and
**`ghcr.io/kurvant/intellisper-cloud`** (`.github/workflows/build-cloud-image.yml:41`). The install
docs tell users to run `activepieces/activepieces` — someone else's image on Docker Hub. Every
documented deploy installs Activepieces, not Intellisper.

| File:line | Current |
|---|---|
| `install/options/docker.mdx:23,65,81` | `activepieces/activepieces:latest` |
| `install/guides/rollback.mdx:48,56,67` | `activepieces/activepieces:0.78.0` / `:0.77.0` |
| `install/options/gcp.mdx:14` | `Image: activepieces/activepieces` |

### GHCR package link — half-rebranded, 404s today
`embedding/sdk-changelog.mdx:66,74` → `github.com/Kurvant/Intellisper/pkgs/container/**activepieces**/438888138`
The org was rebranded but the package path still says `activepieces`. Needs the real container package
name under the Kurvant/Intellisper org.

---

## 🟡 SAFE mechanical fixes (fix now — pure text, zero ambiguity)

| File:line | Current | Fix |
|---|---|---|
| `admin-guide/guides/scim/providers/okta.mdx:33`, `microsoft-entra-id.mdx:34` | `https://your-activepieces-domain/api/v1/scim/v2` | `https://your-intellisper-domain/…` (placeholder text) |
| `flows/debugging-runs.mdx:14` | image `using-activepieces-debugging.png` | rename asset → `using-intellisper-debugging.png` + update ref |
| `install/options/helm.mdx:193` | link text still reads `activepieces.com` (href already `intellisper.com`) | fix the visible label |
| `install/architecture/block-syncing.mdx:6` | npm search `%40activepieces%2Fpiece-` | `%40intelblocks%2Fblock-` (matches the `@intelblocks` scope) — **verify the published npm scope first** |

---

## 🟠 NEEDS OWNER INPUT — cannot be inferred safely

| File:line | Current | Question |
|---|---|---|
| `admin-guide/guides/secret-managers/cyberark-conjur.mdx:36,94,95,119` | `host/activepieces/activepieces`, `/activepieces/activepieces-secrets`, `conjur:host:activepieces/activepieces` | These are **your CyberArk Conjur policy IDs**. Only you know the real policy/host names. What should they be? |
| `build-blocks/misc/private-fork.mdx:22,59,68`, `setup-fork.mdx:20` | `git@github.com:activepieces/activepieces.git` (+ `YOUR_USERNAME/activepieces.git`) | Fork-workflow docs. Is the upstream **still Activepieces** (you fork *their* repo) or **Kurvant/Intellisper** (users fork *yours*)? This changes the correct value. |
| `install/options/aws.mdx:88,95` | `activePiecesUrl` (Pulumi output) | The AWS deploy template (**not in this repo**) prints this variable. Rename the **template** first, then the docs — otherwise the docs describe output that no longer exists. |

---

## ⚫ MUST NOT CHANGE — real third-party URLs (leave as-is)

Renaming these 404s them. They change only if/when those external listings are re-published under
Intellisper.

| File:line | URL | Owner |
|---|---|---|
| `about/i18n.mdx:14`, `build-blocks/block-reference/i18n.mdx:16` | `crowdin.com/project/activepieces` | Crowdin (your translation project — rename in Crowdin, then here) |
| `install/options/aws.mdx:13`, `railway.mdx:16` | `hub.docker.com/r/activepieces/activepieces` | Docker Hub listing |
| `install/options/elestio.mdx:8` | `elest.io/open-source/activepieces` | Elestio catalog |
| `install/options/easypanel.mdx:8` | `easypanel.io/docs/templates/activepieces` | Easypanel template catalog |

---

## Summary

| Bucket | Count | Action | Status |
|---|---|---|---|
| 🔴 Docker image (wrong product) | 9 | → `ghcr.io/kurvant/intellisper` | ✅ **APPLIED** |
| 🔴 GHCR package path | 2 | → `…/container/intellisper` | ✅ **APPLIED** |
| 🟡 SCIM placeholder host | 2 | → `your-intellisper-domain` | ✅ **APPLIED** |
| 🟡 npm scope search | 1 | → `%40intelblocks%2Fblock-` | ✅ **APPLIED** |
| 🟡 Branded screenshot | 1 | asset + ref → `using-intellisper-debugging.png` | ✅ **APPLIED** |
| 🟡 `activepieces.com` link text | 1 | → `intellisper.com` | ✅ **APPLIED** |
| 🟠 Conjur policy IDs | 4 | **left** — your CyberArk policy/host names | ⏸ NEEDS INPUT |
| 🟠 Git fork upstream | 4 | **left** — is upstream Activepieces or Kurvant/Intellisper? | ⏸ NEEDS INPUT |
| 🟠 Pulumi `activePiecesUrl` | 2 | **left** — fix the AWS template first, then docs | ⏸ NEEDS INPUT |
| ⚫ Third-party URLs (crowdin/docker-hub/elestio/easypanel/pikapods) | 7 | **left** — external listings, renaming 404s them | — LEAVE |
| ⚪ `your-instance.com/activepieces` subpath example | 1 | **left** — `activepieces` here is the USER's URL prefix, not the brand | — LEAVE |

**None breaks code.** All fixes are in the port script (`docs/rewrite/port-content.cjs`) so they
survive a re-port; `docs/` stays untouched until C6.

### ⚠️ Method note — a mistake caught and corrected
The first rebrand attempt used a blanket `activepieces/activepieces → ghcr.io/kurvant/intellisper`
regex. It was **too greedy** and produced nonsense: `git@github.com:ghcr.io/kurvant/intellisper.git`,
`conjur:host:ghcr.io/kurvant/intellisper`, `hub.docker.com/r/ghcr.io/…`. Because `docs/` is never
edited (only the generated copy is), the fix was a script change, not a hand-repair. The corrected
rule rewrites `activepieces/activepieces` **only** in true image positions (`image:`/`Image:`,
`docker pull`, `--name`, env-prefixed run, tagged refs) and **never** when preceded by `/` or `.`
(i.e. inside a URL/git/conjur string). Verified: 0 mangled strings, and every git/conjur/URL form is
byte-for-byte intact.
