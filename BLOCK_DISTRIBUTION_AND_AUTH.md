# Block Distribution & OAuth — Options, Constraints, Recommendation

Status: decision document. Nothing here is implemented yet, except where noted.
Context: deploying to the cloud. Every claim below was verified against this
codebase; file paths and line references are given so they can be re-checked.

---

## Part 1 — How block code actually reaches a worker

Two things are often confused. They are completely separate:

| | What it is | Where it lives | When it's fetched |
|---|---|---|---|
| **Metadata** | display name, logo, actions/triggers, prop schemas | `block_metadata` rows in Postgres | on catalog list/get |
| **Code** | the block's actual JavaScript | npm, or a `.tgz` archive | lazily, at execution time |

The catalog currently holds **741 metadata rows** (seeded by
`packages/server/api/src/seed-blocks.ts`). That is what populates the step picker.
It contains no executable code, which is why the API process stays light regardless
of catalog size.

When a step runs — or when a dynamic dropdown calls its `options()` function — the
worker needs the real code. It writes a `package.json` and runs `bun install`:

```js
// packages/server/worker/src/lib/cache/pieces/piece-installer.ts:241-245
'dependencies': {
  [blockPackage.blockName]: blockPackage.packageType === PackageType.REGISTRY
    ? blockPackage.blockVersion                        // ← npm install by name
    : getPackageArchivePathForBlock(rootWorkspace, ..) // ← install from a local .tgz
}
```

`packageType` is per-row and decides which branch runs.

### The current problem

The seeder wrote every row as `packageType: REGISTRY`. So the worker asks npm for
`@intelblocks/block-google-docs@0.4.3`, and npm has never heard of the
`@intelblocks` scope:

```
GET https://registry.npmjs.org/@intelblocks%2fblock-google-docs - 404
```

**Consequence today: all 741 blocks browse fine; almost none of them execute.**

### The one escape hatch, and why it does not scale

`IB_DEV_BLOCKS` is a comma-separated allow-list. Blocks named in it are *excluded*
from the install step entirely and loaded from their local `dist/` folder:

```ts
// piece-installer.ts:60-61
const devBlocks = workerSettings.getSettings().DEV_BLOCKS
const nonDevBlocks = blocks.filter(b => !devBlocks.includes(getBlockNameFromAlias(b.blockName)))
```

We currently list 18 blocks there (all `google*`, `slack`, `store`), which is why
those execute and the rest do not. This is a **development affordance**, not a
distribution strategy: every listed block is `require()`d into the worker process,
so memory and boot time grow linearly with the list. It does not scale to 741.

---

## Part 2 — The options

### Option A — Publish `@intelblocks/*` to public npm

The worker's `REGISTRY` branch works as-is. No code changes.

- The `@intelblocks` scope is currently unclaimed on npm.
- The `piece` → `block` rename is irrelevant here: what matters is the package
  name, and ours are already `@intelblocks/block-*`.
- **You publish your fork's source to a public registry.** Anyone can read it.

**Involves:** claiming the scope; a CI publish pipeline over ~744 packages; a
versioning policy (each block carries its own version and the catalog references an
exact one).

### Option B — Publish to a private registry

Identical to A from the worker's perspective — it just runs `bun install` — so
anything npm-protocol-compatible works.

| | Cost | Notes |
|---|---|---|
| **Verdaccio** | free, self-hosted | ~an afternoon to stand up; you operate it |
| **GitHub Packages** | free for your org | you already have the GitHub account |
| **Artifactory / Nexus** | paid, heavy | only if you already run one |

**Involves:** everything in A, plus pointing the worker at the registry
(`.npmrc` / `bunfig.toml` with a registry URL + auth token, and config plumbing so
the URL is operator-supplied rather than hardcoded), plus a read token on every
worker.

### Option C — `ARCHIVE`: pack each block to a `.tgz`

This is the branch already used by `POST /v1/blocks` and the `publish-block` CLI.
It is *not* the offline silver bullet I initially suggested. Two findings changed
my assessment:

**C.1 — Archives are stored in Postgres, not S3.**

```ts
// packages/server/api/src/app/file/file.service.ts:302-308
export function getLocationForFile(type: FileType) {
    const FILE_LOCATION = system.getOrThrow(AppSystemProp.FILE_STORAGE_LOCATION)
    if (isExecutionDataFileThatExpires(type)) {
        return FILE_LOCATION      // ← only expiring run data honours the setting
    }
    return FileLocation.DB        // ← everything else, unconditionally
}
```

`FileType.PACKAGE_ARCHIVE` falls into the second branch (it returns `false` from
`isExecutionDataFileThatExpires`, line 323). So archives become **`bytea` rows in
Postgres**, even when `FILE_STORAGE_LOCATION=S3` and even though a working S3 helper
with presigned URLs already exists (`file/s3-helper.ts`). Fixing this is a code
change, not a config change.

**C.2 — `ARCHIVE` does not remove the npm dependency.**

The archive substitutes only the *block's own* package. Its dependencies still
resolve through `bun install`. A real example:

```json
// packages/blocks/community/google-docs/package.json
"dependencies": {
  "@intelblocks/blocks-common":    "workspace:*",
  "@intelblocks/blocks-framework": "workspace:*",
  "@intelblocks/shared":           "workspace:*",
  "googleapis": "129.0.0", "googleapis-common": "7.2.0",
  "dayjs": "1.11.9", "tslib": "2.6.2"
}
```

At pack time `resolveWorkspaceDependencies`
(`packages/cli/src/lib/utils/workspace-utils.ts:36-56`) rewrites `workspace:*` into
a concrete version — e.g. `"@intelblocks/blocks-framework": "0.5.2"`. That is a
plain version spec, so **the framework packages must themselves be resolvable from a
registry.** `googleapis` and friends come from npm regardless.

**So `ARCHIVE` still requires publishing at least `@intelblocks/blocks-framework`,
`blocks-common` and `shared`, and still requires npm reachability for third-party
dependencies.** It is not air-gapped. My earlier "no external infrastructure, works
air-gapped" claim was wrong, and this is the correction.

---

## Part 3 — Answering the cloud question directly

> *We will deploy to the cloud. If we use the tar.gz approach, won't it take much
> space and affect server load time and performance?*

**Yes — and worse than you'd expect, because of C.1.**

Measured compiled size, code only (no `node_modules`):

| block | dist size |
|---|---|
| google-docs | 58 KB |
| airtable | 149 KB |
| notion | 206 KB |
| slack | 334 KB |
| google-sheets | 402 KB |

Across 744 packages that is roughly **150–250 MB of tarballs**. That is not much for
object storage. It is a lot for a Postgres `bytea` column, which is where C.1 puts it.

Concrete issues with `ARCHIVE` on cloud, in severity order:

1. **Database bloat.** Every archive is a large-object row. Backups, restores,
   replication and WAL all inflate. Postgres is the worst place to keep binaries;
   this is what object storage exists for. **This is the blocking issue.**
2. **API becomes a file server.** Workers pull archives through the API. With
   `FileLocation.DB` there is no presigned-URL path, so the bytes stream through the
   API process — turning your API into a bandwidth bottleneck on cold starts.
3. **Cold-start amplification.** Autoscaled workers start with an empty cache. The
   install cache (`partitionBlocksToInstall` / `markBlocksAsUsed`, piece-installer.ts:62)
   is **per-worker and on local disk**. Every new replica re-downloads everything it
   needs. Ephemeral filesystems (Fargate, Cloud Run, K8s without a PVC) mean this
   happens on every deploy.
4. **You still need a registry anyway** — see C.2. So you'd pay the archive cost
   *and* run a registry.

None of these apply to `REGISTRY` + a real registry: npm/Verdaccio/GitHub Packages
are CDN-backed, workers pull directly without touching your API or database, and
tarballs are cached by the package manager.

### Recommendation for cloud

**Use `REGISTRY` with a private registry (Option B). Do not use `ARCHIVE` for the
first-party block catalog.**

Concretely:

1. Publish `@intelblocks/*` (744 block packages plus `blocks-framework`,
   `blocks-common`, `shared`) to **GitHub Packages** — free for your org, you already
   have the account, and it's npm-protocol-compatible so the worker needs no code
   change beyond registry config.
2. Keep every catalog row as `packageType: REGISTRY`. The seeder already writes this.
3. Make the registry URL and auth token operator-supplied config, injected into the
   worker as `.npmrc` / `bunfig.toml`.
4. Keep `IB_DEV_BLOCKS` for local development only. It should be empty in every
   deployed environment.

Reserve `ARCHIVE` for what it was designed for: **an organisation uploading its own
private block** via `POST /v1/blocks`. That's one-off, low-volume, and the Postgres
storage cost is irrelevant at that scale.

If you later need true air-gap support, the fix is to make `PACKAGE_ARCHIVE` honour
`FILE_STORAGE_LOCATION` (a small change to `getLocationForFile`) and mirror
third-party deps into an internal registry. Both are real projects; neither is
needed for a cloud deployment.

---

## Part 4 — Block OAuth authentication

### What was wrong

The connection dialog was asking end users for a **Redirect URL, Client ID and
Client Secret** on the *primary* auth method. Upstream only asks for those behind
"Try another method".

Root cause: `createOAuth2Options` (`packages/web/src/app/connections/multi-auth-list.tsx`)
only offers "OAuth2 (Recommended)" when a **predefined OAuth2 app** exists for the
block. Otherwise it collapses to `AppConnectionType.OAUTH2`, which renders those
three fields.

Upstream sources predefined apps from `https://secrets.activepieces.com/apps`, keyed
`@activepieces/piece-google-docs`. Our blocks are `@intelblocks/block-*`, so nothing
ever matched.

### Why we did not "just fix the key"

`CLOUD_OAUTH2` does not merely borrow a client ID. Per
`app-connection-service/oauth2/services/cloud-oauth2-service.ts`, it POSTs the
**user's authorization code** to `secrets.activepieces.com/claim`, where Activepieces
exchanges it with *their* client secret and returns the access and refresh tokens.
`refresh()` calls their `/refresh` the same way. The redirect was hardcoded to their
`/redirect`. That is why the Google consent screen read **"to continue to
Activepieces"**.

Remapping the keys would have routed our users' Google tokens through a third party
we do not control, under another company's OAuth client. It was rejected.

### What was implemented

Commit `6bcccfeb21`.

- Removed `listCloudOAuth2Apps()` and the hardcoded
  `secrets.activepieces.com/redirect`. `packages/web/src` no longer references that
  host at all.
- Predefined apps now come **solely from platform-registered OAuth2 apps**
  (`POST /v1/oauth-apps` → `platformOAuth2App`), which already took priority over the
  cloud app.
- The `CLOUD_OAUTH2` enum and its server service are left intact so any legacy
  connection value still deserialises. Nothing can create one any more.

**Result:** register a Google OAuth app under Settings → OAuth Apps, and users get
"OAuth2 (Recommended)" with a consent screen branded for *your* instance and tokens
exchanged by *your* server. Until one is registered, the dialog honestly asks the
user for their own credentials.

### Edition note (deploying `IB_EDITION=cloud` — this is fine)

The deployment runs the **cloud** edition. That is the right edition for branded
OAuth: `oauthAppModule` is registered under both `CLOUD` and `ENTERPRISE`:

```ts
// packages/server/api/src/app/app.ts
case IbEdition.CLOUD:      … await app.register(oauthAppModule)   // ✅ (our case)
case IbEdition.ENTERPRISE: … await app.register(oauthAppModule)   // ✅
case IbEdition.COMMUNITY:  …                                      // ❌ not registered
```

So under `cloud`, platform OAuth2 apps work and the "OAuth2 (Recommended)" flow is
available once an app is registered (Part 4 steps above). No code change needed.

For contrast — and as a warning against accidentally shipping the wrong edition —
under `IB_EDITION=ce` there would be **no** platform OAuth2 apps at all: the frontend
hardcodes an empty map (`oauth-apps-hooks.ts:82`,
`edition === IbEdition.COMMUNITY ? { data: [] } : …`) and every OAuth connection would
ask the end user to paste their own Client ID and Secret. **Confirm the deployed
edition is `cloud`, not `ce`.**

Note `IbEdition.CLOUD` also registers `adminPlatformModule` (`apply-license-key`,
`increase-ai-credits`, run-retry). Those endpoints are guarded by an operator key
(`AppSystemProp.API_KEY`); make sure that key is set to a strong value in production.

### Also outstanding

The **AI & Agents** tab is hidden until an AI provider is configured. Its gate is:

```ts
// packages/web/src/app/builder/pieces-selector/index.tsx:151
platform.plan.agentsEnabled && !isNil(aiProviders) && aiProviders.length > 0
```

`agentsEnabled` is already `true`; `ai_provider` has 0 rows. Add one via
**Platform → Setup → AI** or `POST /v1/ai-providers`. This is correct behaviour, not
a bug — an AI tab with no provider would be non-functional.

---

## Summary of decisions needed

| # | Decision | Recommendation |
|---|---|---|
| 1 | How block code is distributed | `REGISTRY` + **GitHub Packages** (private). Not `ARCHIVE`. |
| 2 | Edition for the cloud deployment | **`cloud`** (confirmed correct). Just verify the deployed value is not accidentally `ce`. |
| 3 | Google OAuth app | Register one under Settings → OAuth Apps once (2) is settled. |
| 4 | `IB_DEV_BLOCKS` | Empty in every deployed environment. Local dev only. |
| 5 | `.env.dev` | `git rm --cached` it; ship a `.env.dev.example`. It is tracked and carries `IB_JWT_SECRET`, `IB_ENCRYPTION_KEY`, `IB_POSTGRES_PASSWORD`. |
