# OpenAPI schema fix — verified work list (source-of-truth approach)

Owner chose "fix the API schemas" so the spec becomes accurate and regenerable. This is **API-package
work** (`packages/server/api`), not docs. It must be done carefully: nothing breaks, nothing
consequential wrong.

## Safety facts (verified, so the change is provably behaviour-inert)
- **Nothing reads `schema.tags` or `schema.summary` at runtime** — grep across `core/` + `helper/`
  found no consumer. They are OpenAPI-only metadata, emitted by `@fastify/swagger`
  (`jsonSchemaTransform`). Adding them cannot change routing, auth, validation, or handlers.
- `hideUntagged: true` (`app.ts`) is exactly why untagged routes are omitted from the generated spec.
- **Do NOT touch `config.security`** on any route while editing schemas — it is the access contract.
  Only add `tags` + `summary` inside the `schema: {}` block.

## The three buckets (all measured against code)

### Bucket 1 — live routes missing `tags:` (add `tags:` + `summary:`)
These routes are registered and working; they only lack the annotation, so they are omitted from the
spec. 8 groups:

| Tag | Controller file | Ops |
|---|---|---|
| `projects` | `enterprise/projects/platform-project-module.ts` (`platformProjectController`) | 4 |
| `global-connections` | `enterprise/global-connections/global-connection-module.ts` | 4 |
| `project-members` | `enterprise/projects/project-members/project-member.module.ts` | 3 |
| `git-repos` | `enterprise/projects/project-release/git-sync/git-sync.module.ts` | 1 |
| `project-releases` | `enterprise/projects/project-release/project-release.module.ts` | 1 |
| `blocks` | `pieces/metadata/piece-metadata-controller.ts` (`blockModule`) | 1 |
| `embedding` | `enterprise/embed-subdomain/embed-subdomain.module.ts` | 1 |
| `chat` | `enterprise/chat/chat.module.ts` (`chatConversationController`, prefix `/v1/chat/conversations`) | 8 |

Each route already has a rich prose comment above it — use it to write a concise `summary` (one line)
and, where the existing `description` is thin, improve it.

### Bucket 2 — already tagged, missing only `summary:` (add `summary:`)
67 operations across the 16 already-tagged groups (`agent`, `app-connections`, `flow-runs`, `flows`,
`folders`, `knowledge-base`, `mcp`, `mcp-oauth`, `platforms`, `records`, `sample-data`, `tables`,
`templates`, `user-invitations`, `users`, `worker-machines`). They carry a `description`; add a short
`summary` beside it. The plugin needs `summary || operationId`, so this is what makes them generate.

### Bucket 3 — PHANTOM, do NOT tag
- **`event-destinations`** — the snapshot documents `GET /v1/event-destinations`, but there is **no
  HTTP route** for it in the API. It is a **worker job** (`worker/src/lib/execute/jobs/
  event-destination.ts`), not an endpoint. Confirmed: no `app.get/post` + no controller/module, only
  `.entity.ts` + `.service.ts`. **This endpoint should be REMOVED from the docs' API surface**, not
  tagged — it is an inherited-Activepieces phantom. (Flag for the owner: is an event-destinations
  *management* API intended? If so it is unbuilt.)

## Execution discipline (per the "nothing breaks" bar)
1. One controller at a time.
2. After each: `bunx tsc -p packages/server/api/tsconfig.app.json --noEmit` = 0 errors.
3. After the batch: `cd packages/server/api && bunx vitest run test/unit` = green (currently 790).
4. Never alter `config.security` or handler logic — schema-metadata only.
5. Regenerate the spec from a booted server (needs DB+Redis) OR, if that is impractical here,
   hand-verify each edited route appears in a fresh `fastify.swagger()` dump before trusting it.

## Then, docs side
Once the spec carries tags+summaries, `bun run docusaurus gen-api-docs intellisper` regenerates the
API Reference cleanly, which unblocks **M4** and the Mockup-3 design work **M5b**.

**Status:** IN PROGRESS — **paused on a product decision** (below).

---

## ⚠️ EXECUTION FINDING — tagging is a "which endpoints are public API?" decision, not mechanical

Started with `projects` (4 routes tagged, tsc 0 — done). Reading the next controllers surfaced that
**the code has MORE routes than the stale snapshot documented**, so tagging them would *expand* the
public API surface:

| Group | Snapshot documented | Code actually exposes | Delta |
|---|---|---|---|
| `projects` | 4 | 4 | ✅ done |
| `global-connections` | 4 | 4 | ✅ matches |
| `project-members` | 3 (list, delete, roles→members) | 4 (+ `GET /role`) | +1 |
| `git-repos` | **1** (`POST /`) | **4** (+ `GET /`, `DELETE /:id`, `POST /:id/push`) | **+3** |
| `project-releases` | **1** (`POST /`) | **4** (+ `GET /`, `POST /diff`, `GET /:id`) | **+3** |
| `embedding` | 1 (`allowed-embed-origins`) | different shape (`GET/POST/verify/DELETE` on `/`) | mismatch |
| `chat` | 8 | 8 (registered) | needs confirming public |

**The decision (owner):** for each group, should the docs expose **only what the snapshot had**
(minimal, matches today's published API) or **every route the code serves** (fuller, but publishes
endpoints that were never public before)? Tagging a route = publishing it. This is a product call —
what is the supported public API? — not something to infer.

Recommendation: tag only routes that are **intended public API**. The extra routes (git push, release
diff, member role, etc.) are plausibly internal/admin-console-only. Confirm per group before tagging.

**Also unresolved:** `chat` (8) — is the chat conversation API public? `event-destinations` — phantom,
remove (no HTTP route).

**Owner decision (2026-07-18): publish ONLY the snapshot's routes.** So each group is tagged to exactly
the routes the snapshot documented; the extra code routes stay untagged (hideUntagged keeps them out).

### DONE — untagged groups tagged to the snapshot set (tsc 0, 797 tests pass)
| Group | Snapshot routes | Tagged | Notes |
|---|---|---|---|
| `projects` | 4 | 4 ✅ | |
| `global-connections` | 4 | 4 ✅ | |
| `project-members` | 3 | **2** | 3rd (`GET /project-roles/:id/project-members`) is a PHANTOM — not implemented |
| `git-repos` | 1 | 1 ✅ | 3 extra code routes left untagged (per decision) |
| `project-releases` | 1 | 1 ✅ | 3 extra code routes left untagged |

### PHANTOMS — snapshot documents routes this codebase does NOT implement (cannot tag; stay out)
Confirmed absent (grep, no `app.get/post`):
- `event-destinations` — worker job, no HTTP route.
- `GET /v1/project-roles/{id}/project-members` — no such route in `project-role.module.ts`.
- `POST /v1/embed-subdomain/allowed-embed-origins` — `AddAllowedEmbedOriginsRequestBody` is registered
  as a schema in `app.ts:459` but used by NO route; the `embed-subdomain` module serves `/`, `/verify`
  instead. So the `embedding` group has no real snapshot route.

These will simply be absent from the regenerated spec — correct under "publish only snapshot routes".
**Flag for owner:** if any was *meant* to exist (embed-origins management, roles→members), it is unbuilt.

### STILL TO DO
- **`chat` (8 routes) — DECISION (owner, 2026-07-18): NOT public.** Left untagged; `hideUntagged`
  keeps the chat-conversations API out of the public spec. Controller not touched. (The snapshot
  listed it because it inherited the full Activepieces surface; excluding it is the correct call.)
- **67 already-tagged ops** — add a one-line `summary` to each (they have `description`). Mechanical
  but must be authored per route. Not started.

**Net: 12 routes tagged so far, all snapshot-matched. tsc 0, tests 797.**

---

## ✅ COMPLETE (2026-07-18) — spec regenerated, filtered, API docs build

### Summaries added (Bucket 2)
All 68 published, tagged snapshot ops now carry a `summary` (needed for the docs plugin to render a
page). flows(6) + flow-runs(4) + tables(10) + records(3) + app-connections(7) + templates(6) +
folders(5) + user-invitations(3: send+list+delete) + users(3) + platforms(1) + mcp-platform(3) +
mcp-server(3) + knowledge-base(9) + agent(1) + sample-data(2) + mcp-oauth(1) + worker-machines(1) +
projects/global-connections/project-members/git-repos/project-releases(12, done earlier).
**tsc 0, 797 unit tests pass.**

### Spec regenerated from LIVE code, then filtered to the public surface
- `docs/rewrite/gen-openapi.ts` — boots the real server in-process against dev Postgres+Redis and
  dumps `GET /api/v1/docs` (`fastify.swagger()`) → the authoritative spec (161 ops, edition=cloud).
- `docs/rewrite/filter-openapi.cjs` — enforces "publish only the snapshot's routes":
  1. strips the `/api` mount prefix (paths → `/v1/...`, matching the `api.intellisper.com` server URL);
  2. keeps ONLY the 21 published public tag groups; drops the 4 internal groups that the cloud edition
     tags but the snapshot never had — **browser-agent (70), variables (6), ai-gateway (3), memory (2)**;
  3. prunes emptied paths + the top-level `tags[]`.
- **Result: 80 operations / 57 paths / 21 tags.** Every op has `summary`. No `/api` prefix. No internal
  routes. Idempotent (safe to re-run).

### Owner decisions applied (2026-07-18)
- **blocks: DROPPED entirely.** The snapshot's only blocks op (`POST /v1/blocks`) is a phantom in this
  fork; the real read routes (`GET /v1/blocks`, `/v1/blocks/{name}`) were never in the snapshot and are
  left untagged. No blocks group published.
- **browser-agent / ai-gateway / memory / variables: EXCLUDED** (internal; not in snapshot). Code
  untouched — they still serve at runtime; only the docs' advertised surface is filtered.
- **chat: excluded** (earlier decision — not public).

### Docs generated + build green
- `docusaurus gen-api-docs intellisper -p api` → 80 `.api.mdx` pages + 1 info page + `sidebar.ts`.
- `gen-sidebars.cjs` now imports the plugin's generated `apisidebar` and splices it under
  `api-reference` (after the Get Started intro). Page-accounting gate still closes 216/216.
- `docusaurus build` **succeeds**. Only ONE broken link remains: the intentionally-deferred
  `/handbook/engineering/playbooks/run-ee` (owner reminder owed). The phantom
  `add-allowed-embed-origins` link was rewritten in `port-content.cjs` §3e(d) to point at the real
  `allowedEmbedOrigins` platform setting.

**M4 DONE → M5b (API Reference dark 3-column design) unblocked.**
