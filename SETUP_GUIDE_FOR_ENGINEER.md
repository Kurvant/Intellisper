# Setup Guide (step by step)

Written for someone new to this codebase. Each task says **why** first, then the
exact commands. Read [BLOCK_DISTRIBUTION_AND_AUTH.md](BLOCK_DISTRIBUTION_AND_AUTH.md)
for the full reasoning behind these decisions — this file is the "how".

We are deploying the **cloud** edition (`IB_EDITION=cloud`). Do everything in a
branch, open a PR, get it reviewed. Do not push straight to `main`.

Notation: `$` means "type this in a terminal". `IB_...` are environment variables.

---

## Task 0 — Understand two environment files first

There are two config files and it matters which one the server reads.

- `.env` — exists, but the running server does **not** read it.
- `.env.dev` — this is the one `bootstrap.ts` actually loads. It is **tracked by
  git** (a problem we fix in Task 4).

Rule of thumb while developing: **edit `.env.dev`**, not `.env`.

To run the whole app locally you need all four services. Only this command starts
all of them:

```bash
$ npm run dev        # web + api + engine + worker
```

`npm run serve:backend` + `serve:frontend` do **not** start the worker, and without
the worker, dropdowns spin forever. Always use `npm run dev`.

---

## Task 1 — Empty `IB_DEV_BLOCKS` in every deployed environment

**Why.** `IB_DEV_BLOCKS` is a *developer* shortcut. Any block named in it is loaded
from local disk and `require()`d straight into the worker process. That is fine for
2–3 blocks on your laptop, but in production it bloats memory and slows startup, and
it hides the real registry path. It must be **empty** in staging and production.

Leave it populated on your own machine if you like — it only matters for deploys.

**Steps.**

1. In the **production** and **staging** environment config (however your cloud host
   sets env vars — a dashboard, a secrets manager, a `.env.production` file, etc.),
   set:

   ```
   IB_DEV_BLOCKS=
   ```

   (empty — nothing after the `=`.)

2. Do **not** change `.env.dev` for this. That file is for local development, where
   dev blocks are useful.

3. Verify after deploy. On the running instance, the API startup log should **not**
   print lines like `Watching for changes: google-sheets`. If it does,
   `IB_DEV_BLOCKS` is still set there.

**Definition of done:** deployed API boot log shows no "Watching for changes" lines,
and the block catalog still lists all blocks (they come from the database, not from
`IB_DEV_BLOCKS`).

---

## Task 2 — Register the Google OAuth app (branded one-click login)

**Why.** When a user connects Google (or Slack, etc.), we want them to see a normal
"Sign in with Google" screen that says *our* product name — not a form asking them
to paste a Client ID and Secret. That only happens when the **platform** has a
registered OAuth app for that block. In the `cloud` edition this feature is enabled;
we just have to register the app once.

This needs a real Google Cloud OAuth client, so it's part config-in-Google,
part config-in-our-app.

**Step A — create the OAuth client in Google Cloud (one time).**

1. Go to <https://console.cloud.google.com/> → pick or create a project.
2. **APIs & Services → OAuth consent screen** → configure it (app name = our product
   name, support email, etc.). This is what the user sees on the consent screen.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URI**: this must be our instance's OAuth redirect URL.
     Do not guess it — read the live value. It is the internal URL followed by
     `/redirect` (verified: `getThirdPartyRedirectUrl()` returns
     `domainHelper.getInternalUrl({ path: '/redirect' })`), i.e.
     `https://<our-domain>/redirect`. The authoritative value is served by the app —
     fetch it and copy it exactly:

     ```bash
     $ curl https://<our-domain>/api/v1/flags \
         | grep -o '"THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL":"[^"]*"'
     ```

     Paste that exact string into Google. A wrong redirect URI is the #1 cause of
     "redirect_uri_mismatch" errors — one trailing-slash difference will fail.
4. Click create. Google gives you a **Client ID** and **Client Secret**. Copy both.
5. Enable the APIs each block needs (for Google Docs: Google Drive API + Google Docs
   API) under **APIs & Services → Library**.

**Step B — register that client in our app.**

The block name to register is the full package name, e.g.
`@intelblocks/block-google-docs`.

Easiest: the admin UI — **Settings → OAuth Apps → Add** — paste block name, Client
ID, Client Secret.

If you prefer the API, the endpoint is `POST /v1/oauth-apps` and the body is exactly
three fields (verified in `packages/shared/src/lib/ee/oauth-apps/oauth-app.ts`):

```bash
$ curl -X POST https://<our-domain>/api/v1/oauth-apps \
    -H "Authorization: Bearer <a platform-admin token>" \
    -H "Content-Type: application/json" \
    -d '{
          "blockName": "@intelblocks/block-google-docs",
          "clientId": "<the Client ID from Google>",
          "clientSecret": "<the Client Secret from Google>"
        }'
```

Repeat per Google product you want branded (docs, drive, sheets, calendar…). One
Google Cloud OAuth client can be reused across several of them as long as you enabled
the right APIs and listed the redirect URI.

**Definition of done:** open the connection dialog for that block → the primary
option reads **"OAuth2 (Recommended)"** and clicking Connect opens Google's consent
screen showing *our* app name, with **no** Client ID / Secret fields on the primary
method.

---

## Task 3 — Set up block distribution on GitHub Packages

This is the big one. It has its own detailed walkthrough below in **Part B**, because
there's a concept to understand first. Do Tasks 0, 1, 4 first — they're quick — then
come back to this.

---

## Task 4 — Get secrets out of git (`.env.dev`)

**Why.** `.env.dev` is committed to the repository and contains secret values:
`IB_JWT_SECRET`, `IB_ENCRYPTION_KEY`, `IB_POSTGRES_PASSWORD`, `IB_QUEUE_UI_PASSWORD`,
`IB_WORKER_TOKEN`. Anyone with repo access can read them, and they're baked into git
history. Even though today's values look like local-dev placeholders, a tracked
secrets file is a habit that eventually leaks a real secret. We stop tracking it and
provide a template instead.

⚠️ Coordinate with the team before doing this — everyone who pulls afterwards will
need to recreate their own `.env.dev` from the template. Announce it.

**Steps.**

1. Create the branch:

   ```bash
   $ git checkout -b chore/untrack-env-dev
   ```

2. Make a template with **placeholder** values (never real secrets). Copy `.env.dev`
   to `.env.dev.example`, then open `.env.dev.example` and replace every secret value
   with a placeholder like `CHANGE_ME`:

   ```bash
   $ cp .env.dev .env.dev.example
   # now edit .env.dev.example: blank out IB_JWT_SECRET, IB_ENCRYPTION_KEY,
   # IB_POSTGRES_PASSWORD, IB_QUEUE_UI_PASSWORD, IB_WORKER_TOKEN → CHANGE_ME
   ```

3. Stop tracking the real file (this keeps it on your disk, just removes it from git):

   ```bash
   $ git rm --cached .env.dev
   ```

4. Confirm `.gitignore` already ignores it. It has a `.env*` rule, but that rule was
   being ignored *because the file was already tracked*. After step 3 the rule takes
   effect. Verify:

   ```bash
   $ git check-ignore .env.dev      # should print: .env.dev
   ```

5. Commit both changes:

   ```bash
   $ git add .env.dev.example .gitignore
   $ git commit -m "chore: stop tracking .env.dev, add .env.dev.example template"
   ```

6. Open the PR. In the description, tell reviewers: after merge, everyone must copy
   `.env.dev.example` to `.env.dev` and fill in real values locally.

**About the secrets already in history:** removing the file now stops *future*
exposure but the old values still exist in past commits. Because they are dev
placeholders, rewriting history is probably overkill — but the JWT secret,
encryption key and DB password used in **production must be different** from anything
that was ever in git. Confirm production uses its own secrets, set outside the repo.

**Definition of done:** `git check-ignore .env.dev` prints `.env.dev`;
`.env.dev.example` exists with placeholders; `git ls-files | grep .env.dev` shows
only `.env.dev.example`.

---

# Part B — Block distribution on GitHub Packages (Task 3, in detail)

## First: is GitHub Packages an alternative to the npm registry? Are they similar?

**Yes to both, and this is the key insight that makes this easy.**

"The npm registry" (`registry.npmjs.org`) is just a **server that speaks a protocol**:
you `npm publish` packages to it, and `npm install` / `bun install` downloads them
from it. GitHub Packages is a *different server that speaks the exact same protocol*.
So is Verdaccio, so is Artifactory. To `bun install`, they are interchangeable — you
only change **which URL** it talks to and **which token** it authenticates with.

Think of it like email: Gmail and Outlook are different providers, but both speak
SMTP/IMAP, so any mail client works with either by changing the server address. Same
idea here.

Practical differences that matter to us:

| | npmjs.org | GitHub Packages |
|---|---|---|
| Cost for private packages | paid org | **free** for your org |
| Who can read | public (unless paid private) | **your org only**, by default |
| Auth | npm token | a GitHub token (you already have GitHub) |
| Where it lives | npm's servers | tied to your GitHub org |

We pick GitHub Packages because it's free, private by default, and we already use
GitHub. **The code needs no change** — only registry config. In fact this repo
already has an `.npmrc` set up for the `@intelblocks` scope; we just repoint it.

## The mental model

Our blocks are packages named `@intelblocks/block-google-docs`, etc. Right now the
catalog tells the worker "install `@intelblocks/block-google-docs@0.4.3`", the worker
asks npmjs.org, and npmjs.org says 404 because we never published there. The fix is
two halves:

1. **Publish** all `@intelblocks/*` packages to GitHub Packages (a one-time job, then
   automated in CI).
2. **Point the worker** at GitHub Packages instead of npmjs.org, with a token so it's
   allowed to read them.

## Step 3.1 — Create a token that can read/write packages

1. On GitHub: **Settings → Developer settings → Personal access tokens → Tokens
   (classic) → Generate new token (classic)**.
2. Scopes: check **`write:packages`** (this also grants `read:packages`) and
   **`repo`** if the packages are tied to a private repo.
3. Generate, copy the token. Treat it like a password. Call it `GITHUB_TOKEN` below.

For CI and for the deployed workers you'll use a token too — ideally a dedicated one
with only `read:packages` for the workers (they only download), and `write:packages`
only in the publish pipeline.

## Step 3.2 — Point package tooling at GitHub Packages

This repo already has an `.npmrc` at the root:

```
@intelblocks:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

Change the two lines so the `@intelblocks` scope resolves from GitHub Packages.
Replace `YOUR_ORG` with the GitHub org/user that owns the packages:

```
@intelblocks:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
legacy-peer-deps=true
save-exact=true
```

- `@intelblocks:registry=...` means "for any package starting `@intelblocks/`, use
  this server." Other packages (`googleapis`, `dayjs`, …) still come from npmjs.org.
  That's what we want.
- `${GITHUB_TOKEN}` is read from the environment, so the token itself is **not**
  written into the file. Set `GITHUB_TOKEN` in your shell / CI / deploy env.

⚠️ `.npmrc` is currently tracked by git and must **not** contain a real token. Keep
using the `${GITHUB_TOKEN}` placeholder form. The token lives only in the environment.

## Step 3.3 — Make sure the packages are publishable

Each `@intelblocks/*` package.json needs a `publishConfig` pointing at GitHub
Packages, or it'll try npmjs.org. For a scoped package on GitHub Packages you add:

```json
"publishConfig": {
  "registry": "https://npm.pkg.github.com"
}
```

There are ~744 block packages plus `blocks-framework`, `blocks-common`, `shared`, so
do this with a script, not by hand. Ask a senior engineer before writing a bulk
script that edits every package.json — it's easy to get wrong. A safe approach is a
small Node script that walks `packages/blocks/**/package.json` and adds the field if
missing.

Also confirm the **`name`** field of the framework packages matches what blocks
depend on (`@intelblocks/blocks-framework`, etc.), because at publish time
`workspace:*` deps get rewritten to real versions and must resolve from the registry.

## Step 3.4 — Publish (start with a dry run on ONE package)

Never bulk-publish first. Prove it on a single package.

1. Pick one, e.g. `@intelblocks/shared` (blocks depend on it, so it must exist first).
2. Build it, then dry-run:

   ```bash
   $ export GITHUB_TOKEN=<your token>
   $ cd packages/shared
   $ npm publish --dry-run          # shows what WOULD be published; uploads nothing
   ```

3. If the file list looks right, publish for real:

   ```bash
   $ npm publish
   ```

4. Check it appears under your org's **Packages** tab on GitHub.
5. Publish the other two framework packages (`blocks-common`, `blocks-framework`)
   the same way — order matters, dependencies before dependents.
6. Then one block, e.g. `@intelblocks/block-google-docs`, and confirm it publishes and
   that its dependency on the framework resolves.

Only after a single block round-trips should you automate the full ~744-package
publish (a CI job, or `turbo run publish` if a publish task is added — coordinate
with a senior engineer on the pipeline).

## Step 3.5 — Point the deployed workers at the registry

The workers run `bun install` to fetch block code. They must see the same registry
config and a read token.

1. In the **worker's** deployment environment, set `GITHUB_TOKEN` (or a
   read-packages-only token) as an env var.
2. Ensure the `.npmrc` from Step 3.2 is present in the worker's working directory (or
   the image). ⚠️ **Verify this in the actual production image** — `bun install` looks
   for `.npmrc` by walking up from its working directory, and the working directory in
   a Docker image may differ from the repo root you see locally. Confirm with a senior
   engineer that the deployed worker actually picks up the `.npmrc`. This is the most
   common thing to get wrong.
3. Deploy. Trigger a flow that uses a non-dev block (something not in
   `IB_DEV_BLOCKS`). If it runs, distribution works. If you see
   `GET https://npm.pkg.github.com/... 401`, the token is missing/expired on the
   worker. A `404` means the package wasn't published (go back to 3.4).

## Step 3.6 — Confirm end to end

- Catalog still lists all blocks (unchanged — metadata is in the DB).
- A block **not** in `IB_DEV_BLOCKS` (e.g. `airtable`) can be added to a flow and its
  dropdowns/actions work — that proves the worker fetched real code from GitHub
  Packages.
- Worker logs show `bun install` hitting `npm.pkg.github.com`, not a 404.

**Definition of done:** with `IB_DEV_BLOCKS` empty, any block from the catalog can be
executed, and worker logs show installs resolving from GitHub Packages.

---

## Order to do things

1. Task 0 — learn the two env files (5 min reading).
2. Task 1 — empty `IB_DEV_BLOCKS` in deploy config.
3. Task 4 — untrack `.env.dev` (coordinate with team).
4. Task 2 — register the Google OAuth app.
5. Task 3 / Part B — GitHub Packages. Do a single-package dry run before bulk publish.

Ask for review at each step. Tasks 3 and 4 touch shared config and secrets — do not
merge those without a senior engineer looking.
