# Docs overhaul — decisions log (owner, 2026-07-17)

Three issues raised during M3/M5, the owner's decisions, and what was done.

---

## 1. OpenAPI spec — the tag-group question

**What tag groups are:** OpenAPI *tags* are the grouping label on each route's schema in code
(`schema: { tags: ['flows'], … }`). `@fastify/swagger` reads them off the route definitions to build
the spec, which drives the API Reference's section structure. **They come from code, not docs.**

### ⚠️ CORRECTION to the earlier escalation
The earlier report said 9 tag groups were "absent from source", implying a regenerated spec would
*drop endpoints the docs claim*. That was **wrong in an important way** — it measured the absence of
the **tag string**, not the absence of the **route**.

Re-checked by route registration (`prefix: '/v1/…'`):

| Tag | Ops | Route registered in source? |
|---|---|---|
| `projects` | 4 | ✅ yes |
| `global-connections` | 4 | ✅ yes |
| `project-members` | 3 | ✅ yes |
| `git-repos` | 1 | ✅ yes |
| `project-releases` | 1 | ✅ yes |
| `blocks` | 1 | ✅ yes |
| `embedding` | 1 | ✅ yes (`/v1/embed-subdomain`) |
| `chat` | 8 | ❓ no prefix match — needs a closer look |
| `event-destinations` | 1 | ❓ no prefix match — needs a closer look |

**So the real position:** 7 of 9 groups (15 operations) are **live routes that merely lack a `tags:`
annotation** — `hideUntagged: true` omits them from the generated spec. Only `chat` (8) and
`event-destinations` (1) still need investigating.

**Implication:** "fix at source" is **far smaller than first reported** — mostly adding `tags:` +
`summary:` to route schemas that already exist, not reconstructing a phantom API. The 16 already-tagged
groups (`agent`, `app-connections`, `flow-runs`, `flows`, `folders`, `knowledge-base`, `mcp`,
`mcp-oauth`, `platforms`, `records`, `sample-data`, `tables`, `templates`, `user-invitations`, `users`,
`worker-machines`) are unaffected.

**Still true:** `docs/openapi.json` is a committed snapshot from the initial Activepieces import
(`676b80e9`, 2026-07-11) and has never been regenerated; **92 of 93 operations lack `summary`/
`operationId`**, which the Docusaurus OpenAPI plugin requires. M4 + M5b remain blocked until this is
scoped as its own task.

**Status:** OPEN — scoped as separate API-package work.

---

## 2. The two broken Handbook links

### 2a. `embedding/predefined-connection.mdx:14` → "Run the Enterprise Edition"
- Target: `handbook/engineering/playbooks/run-ee` — *"requires postgres, redis, and a license key"*.
- Public-facing content currently filed as an internal playbook.
- **DECISION (owner): defer — scoped as LATER WORK.**
- ⏰ **REMINDER OWED:** the owner must be reminded about this when the overall work is done.
- Status: OPEN (deferred).

### 2b. `about/changelog.mdx:133` → "Read more about our release cycle"
- Target: `handbook/engineering/onboarding/release-cycle` — internal engineering process.
- **DECISION (owner):** the marketing site already carries a changelog → link to
  **`https://intellisper.com/release`**.
- Status: ✅ APPLIED (in the port script, so it survives a re-port).

---

## 3. Canonical URL replacements

**DECISION (owner):** apply the proposed Intellisper equivalents.

| Old | → New |
|---|---|
| `cloud.activepieces.com/api` | `api.intellisper.com` |
| `cloud.activepieces.com` | `cloud.intellisper.com` |
| `www.activepieces.com/sales` | `intellisper.com/sales` |
| `www.activepieces.com/pricing` | `intellisper.com/pricing` |
| `www.activepieces.com/privacy` | `intellisper.com/privacy` |
| `www.activepieces.com/plans` | `intellisper.com/plans` |
| `www.activepieces.com/pieces/ai` | `intellisper.com/blocks/ai` |
| `www.activepieces.com/pieces` | `intellisper.com/blocks` |
| `www.activepieces.com` | `intellisper.com` |
| `cdn.activepieces.com/pieces/…` | `cdn.intellisper.com/blocks/…` |
| `cdn.activepieces.com/…` | `cdn.intellisper.com/…` |
| `community.activepieces.com` | `community.intellisper.com` |
| `demo.activepieces.com` | `demo.intellisper.com` |
| `github.com/activepieces/activepieces` | `github.com/Kurvant/Intellisper` ✅ *verified from the git remote* |
| `sales@activepieces.com` | `sales@intellisper.com` |
| `support@activepieces.com` | `support@intellisper.com` |

⚠️ **Only the GitHub URL is verified to exist.** The rest are the agreed naming convention — every host
still needs to be stood up (or the reference dropped) before launch. Two are the least certain:
`community.` and `demo.` had no obvious Intellisper equivalent and were mapped by convention.

**Status:** ✅ APPLIED in the port script (`port-content.cjs`), so replacements survive a re-port.
`docs/` itself stays untouched until the C6 cutover. Build after applying: **exit 0**.

Two gaps the first pass missed (now fixed in the script, not by hand):
- **Link *text*** — `[cloud.activepieces.com](https://…)`: the href rules only matched `https://…`, so
  the visible label kept the old brand.
- **The 3 partials** were hand-copied in M2 and never went through the transform, so
  `_enterprise-feature.mdx` kept an `activepieces.com/sales` link. The script now ports them too.

### 3b. 49 remaining `activepieces` strings — NOT safe to script (need owner input)
These are deliberately untouched: a blind replace would break working things. Three categories:

| Category | Examples | Why it is not a simple rename |
|---|---|---|
| **Third-party URLs** (❌ must NOT change) | `hub.docker.com/r/activepieces/activepieces`, `elest.io/open-source/activepieces`, `easypanel.io/docs/templates/activepieces`, `crowdin.com/project/activepieces` | Real external listings. Renaming 404s them. They change only when those listings are re-published under Intellisper. |
| **Repo / infra in code samples** | `git clone …/activepieces.git`, `conjur:host:activepieces/activepieces`, `/activepieces/activepieces-secrets` | Rebrandable in principle, but they are commands users copy-paste. Wrong values break them. Needs the real repo/secret paths. |
| **Code identifiers** | `ACTIVEPIECES_SIGNING_KEY`, `activePiecesUrl`, `piecesFilterType` | Resolved individually — see §3c. |

**Status:** OPEN — third-party URLs + repo/infra paths still need owner input.

---

## 3c. Code-sample identifiers — resolved individually

⚠️ **Method note:** the first pass searched for the OLD names in an ALREADY-REBRANDED repo, found
nothing, and wrongly concluded they were "external SDK identifiers". Searching the **rebranded** form
found the truth. Lesson: in a rebranded codebase, search the new name.

| Identifier | Decision | Evidence |
|---|---|---|
| **`piecesFilterType`** → **`blocksFilterType`** | ✅ **APPLIED — this is a real BUG fix, not cosmetics** | The embed JWT field is `blocksFilterType` in source (`shared/.../project.ts:42`, `project-requests.ts:15`, `ee/billing/index.ts:15`, + tests). The docs told customers to send `piecesFilterType` — **a field the server ignores**, so block filtering silently never applied. Fixed in 3 places across `embedding/customize-blocks` + `embedding/provision-users`. |
| **`ACTIVEPIECES_SIGNING_KEY`** → **`INTELLISPER_SIGNING_KEY`** | ✅ APPLIED | It is `process.env.<NAME>` in a JWT-signing sample — the **customer's own** env var name. Nothing in this repo reads it, so renaming carries no code risk. (Signing keys themselves are real: `ConnectionKeyType.SIGNING_KEY`.) |
| **`activePiecesUrl`** | ❌ **NOT renamed — deliberate** | A **Pulumi output variable** from an AWS deploy template that is **not in this repo** (0 hits for either spelling). The docs describe what that template actually prints; renaming the prose would make the docs *wrong*, not right. **Fix the template first, then the docs.** Corroborating: the very next line already reads `intellisperEnv:`, so the template was partly rebranded and this line was missed. |

**Status:** 2 applied ✅ · 1 deferred pending the Pulumi template (`install/options/aws.mdx:88`).

---

## 5. MCP `stepType` enums — documented values the tools REJECT (C2 code-trace)

**Confirmed defect.** `docs/mcp/tools.mdx` documented `PIECE`, `PIECE_ACTION`, `PIECE_TRIGGER`
(15 occurrences). None is accepted by the MCP tools — an agent or user following the docs gets a
schema rejection.

**A blanket `PIECE` → `BLOCK` replace would have been WRONG** — two tools use two different enums:

| Tool | Real enum (source) | Docs said |
|---|---|---|
| `ib_validate_step_config` | `BLOCK_ACTION` \| `BLOCK_TRIGGER` \| `CODE` \| `LOOP_ON_ITEMS` \| `ROUTER` (`ib-validate-step-config.ts:51`) | `PIECE_ACTION`, `PIECE_TRIGGER` |
| `ib_add_step` | `FlowActionType.BLOCK` (`ib-add-step.ts:26,49`) | `PIECE` |
| `ib_build_flow` | `FlowActionType.BLOCK` (`ib-build-flow.ts:22`) | `PIECE` |

**Status:** ✅ APPLIED per-tool in the port script (longest-first, so `PIECE_ACTION` is not clipped by
the bare-`PIECE` rule). Build exit 0; zero `PIECE` residue in the ported docs.

**Noted for the C2 trace, not yet resolved:** `ib_build_flow`'s enum is `CODE | BLOCK |
LOOP_ON_ITEMS` — it has **no `ROUTER`**, but the docs' `ib_build_flow` section lists router steps.
Needs a closer look.

---

## 4. Broken anchors surfaced after the rebrand (new)

With the page-level links fixed, the build exposed **8 broken in-page anchors** that were previously
masked (Docusaurus only reports anchors once page links resolve):

- `flows/known-limits#files-flow-run-logs`
- `#setting-block-source`
- `./embed-builder#configure-parameters`
- 5 × `./sdk-changelog#<date-version>` (e.g. `#04%2F21%2F2026-0-9-0`)

These are heading anchors that no longer match their targets — a real content defect inherited from
the source, not a port artifact. They belong to the C-phase code-trace pass.

**Status:** OPEN — tracked for the content phases.
