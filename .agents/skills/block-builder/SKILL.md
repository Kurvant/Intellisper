---
name: block-builder
description: Builds Intellisper blocks (integrations) with actions and triggers. Use when the user asks to create a new block, add actions to a block, add triggers to a block, or build an integration for a third-party app. Also use when the user mentions Intellisper blocks, connectors, or integration development.
---

# Intellisper Block Builder

## Pick your task mode first

| Mode | What you're doing | Where to go |
|---|---|---|
| **New block** | Building an integration for an app that has no block yet | Full 5-step workflow below |
| **Add action / trigger** | An existing block needs another operation or event | Skip Steps 1–3. Open the existing block, **match its conventions** (its `common/` helpers, auth access, file naming, error handling), then jump to Step 4 IMPLEMENT and Step 5 WIRE & VERIFY. Bump the block version. |
| **Fix a bug** | An existing action/trigger misbehaves | Reproduce → read the offending file *and its `common/` helpers* → smallest fix that matches surrounding style → Step 5 VERIFY. Bump the block version. |

**Golden rule for existing-block modes:** the block you're editing is the source of truth, not these templates. If the block already has a helper, a particular auth access pattern, or a way of shaping output, follow *that*. Reach into the reference files only for a pattern the block doesn't already demonstrate.

## Workflow (new block)

### Step 1: RESEARCH

- Search the web for the target app's REST API documentation
- Identify the auth method (API key, OAuth2, Basic Auth, custom)
- List available endpoints; check if webhooks are supported
- Note base URL, pagination, and rate limits

### Step 2: PLAN

- **Location:** `packages/blocks/community/` by default; `packages/blocks/custom/` only if the user says "custom block". See Block Types below.
- Choose the correct auth type — see Quick Auth Reference below
- Select the most useful actions (CRUD, search, list) and triggers (webhook if supported, polling otherwise)
- **Ask the user** if OAuth2 config is unclear, there are >10 possible actions, or API behavior is ambiguous

### Step 3: SCAFFOLD

Create this structure under `packages/blocks/community/<name>/`:

```
src/
  index.ts
  lib/
    auth.ts             # Auth always lives here — never inline in index.ts
    actions/            # One file per action
    triggers/           # One file per trigger
    common/             # Shared helpers (optional)
package.json
.eslintrc.json
tsconfig.json
tsconfig.lib.json
```

**`package.json`**

```json
{
    "name": "@intelblocks/block-<name>",
    "version": "0.0.1",
    "main": "./dist/src/index.js",
    "types": "./dist/src/index.d.ts",
    "scripts": {
        "build": "tsc -p tsconfig.lib.json && cp package.json dist/",
        "lint": "eslint 'src/**/*.ts'"
    },
    "dependencies": {
        "@intelblocks/blocks-common": "workspace:*",
        "@intelblocks/blocks-framework": "workspace:*",
        "@intelblocks/shared": "workspace:*",
        "tslib": "2.6.2"
    }
}
```

Add third-party SDKs to `dependencies` with a pinned version (e.g. `"stripe": "18.2.1"`).

**`.eslintrc.json`**

```json
{
    "extends": ["../../../../.eslintrc.json"],
    "ignorePatterns": ["!**/*"],
    "overrides": [
        { "files": ["*.ts", "*.tsx", "*.js", "*.jsx"], "rules": {} },
        { "files": ["*.ts", "*.tsx"], "rules": {} },
        { "files": ["*.js", "*.jsx"], "rules": {} }
    ]
}
```

**`tsconfig.json`**

```json
{
    "extends": "../../../../tsconfig.base.json",
    "compilerOptions": {
        "module": "commonjs",
        "forceConsistentCasingInFileNames": true,
        "strict": true,
        "noImplicitOverride": true,
        "noPropertyAccessFromIndexSignature": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true
    },
    "files": [],
    "include": [],
    "references": [{ "path": "./tsconfig.lib.json" }]
}
```

**`tsconfig.lib.json`**

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "rootDir": ".",
        "baseUrl": ".",
        "paths": {},
        "outDir": "./dist",
        "declaration": true,
        "types": ["node"]
    },
    "include": ["src/**/*.ts"],
    "exclude": ["jest.config.ts", "src/**/*.spec.ts", "src/**/*.test.ts"]
}
```

### Step 4: IMPLEMENT

The condensed rules in this file (Quick Auth Reference, Quick Block Definition Template, UX Quality, Output Quality) cover the common case. Open a reference file when you need a concrete copy-ready example for the specific pattern you're building.

**When you need a pattern, read the relevant reference file — do not grep other blocks in the codebase.** The reference files contain copy-ready examples for every common case. Searching `packages/blocks/community/` surfaces inconsistent older code and wastes context.

| When you reach for it | Open this file |
|---|---|
| Wiring auth beyond the Quick Auth Reference table | `auth-patterns.md` |
| Your first action in this block (full file shape) | `action-patterns.md` |
| A trigger — polling, webhook, handshake, or renewal | `trigger-patterns.md` |
| A prop type you haven't used (dropdowns, dynamic, arrays, files) | `props-patterns.md` |
| Shared API helper, pagination, or `createCustomApiCallAction` | `common-patterns.md` |
| An advanced UX pattern (source selectors, AWS-style auth) | `ux-guidelines.md` |
| Flattening a deeply nested API response | `output-quality.md` |
| Tagging an action/trigger for AI agents | `ai-metadata.md` |

### Step 5: WIRE & VERIFY

**Wiring checklist:**

- [ ] Import every action in `src/index.ts` → add to `actions: [...]`
- [ ] Import every trigger in `src/index.ts` → add to `triggers: [...]`
- [ ] Add `createCustomApiCallAction` to `actions: [...]`
- [ ] Register in `tsconfig.base.json` at repo root (insert **alphabetically** — build fails without this):
    ```json
    "@intelblocks/block-<name>": ["packages/blocks/community/<name>/src/index.ts"]
    ```

**Build and lint:**

```bash
bun install   # new blocks only — creates workspace symlinks
npx turbo run build --filter=@intelblocks/block-<name>
npx turbo run lint --filter=@intelblocks/block-<name>
```

Both must pass. Lint failures (unused imports, `any` types, unused vars) block CI even when the build is green.

Common TS errors: missing import in `src/index.ts`, missing `tsconfig.base.json` entry, reading `context.auth` as a plain string for SecretText (use `context.auth.secret_text`), missing `sampleData` on a trigger.

**Test locally:** Add `IB_DEV_BLOCKS=<name>` to `packages/server/api/.env`, start with `npm start`, open `localhost:4200`.

---

## Versioning an existing block

Every change to an existing block needs a version bump in its `package.json`. Without it, live flows never pick up your change.

| Bump | When |
|---|---|
| **MAJOR** | Remove an action/trigger/prop; add a **required** prop to an existing action/trigger; change existing behavior |
| **PATCH** | Add a new action or trigger; add an **optional** prop; add an output attribute; fix a bug |

Rule of thumb: **any removal is breaking, any new required prop is breaking, everything else is PATCH.** When in doubt, prefer MAJOR.

---

## Block Types

| Location | Purpose |
|---|---|
| `packages/blocks/community/` | Third-party integrations (Slack, Stripe, etc.) — use this for almost all work |
| `packages/blocks/core/` | Built-in platform utilities (HTTP, Store, Math, etc.) — do NOT recreate these |
| `packages/blocks/custom/` | Private customer-specific blocks |

Full reference: [block-types.md](block-types.md) — includes all `BlockCategory` values and the list of existing core blocks.

---

## Quick Auth Reference

In actions and triggers, `context.auth` is the resolved connection object — not a flat string:

| API Auth Method | Intellisper Type | Access Pattern |
|---|---|---|
| API key / Bearer token | `BlockAuth.SecretText()` | `context.auth.secret_text` |
| OAuth2 | `BlockAuth.OAuth2()` | `context.auth.access_token`; extra props via `context.auth.props?.['<key>']` |
| Username + password | `BlockAuth.BasicAuth()` | `context.auth.username`, `context.auth.password` |
| Multiple fields | `BlockAuth.CustomAuth()` | `context.auth.props.<field_name>` |
| No auth needed | `BlockAuth.None()` | No `context.auth` available |

Inside the auth's own `validate` callback the shape is different — it receives the raw entered values (plain string for SecretText, flat object for CustomAuth). The table above applies to action/trigger `run()` only.

Full code examples: read `auth-patterns.md`

---

## Quick Block Definition Template

**`src/lib/auth.ts`**
```typescript
import { BlockAuth } from '@intelblocks/blocks-framework';

export const myAppAuth = BlockAuth.SecretText({
    displayName: 'API Key',
    description: 'Go to Settings > API Keys in your dashboard to generate a key.',
    required: true,
});
```

**`src/index.ts`**
```typescript
import { createPiece } from '@intelblocks/blocks-framework';
import { createCustomApiCallAction } from '@intelblocks/blocks-common';
import { BlockCategory } from '@intelblocks/shared';
import { myAppAuth } from './lib/auth';
import { myAction } from './lib/actions/my-action';
import { myTrigger } from './lib/triggers/my-trigger';

export const myApp = createBlock({
    displayName: 'My App',
    description: 'What the app does in one sentence.',
    minimumSupportedRelease: '0.36.1',
    logoUrl: 'https://cdn.activepieces.com/pieces/my-app.png',
    categories: [BlockCategory.PRODUCTIVITY],
    auth: myAppAuth,
    authors: ['your-github-username'],
    actions: [
        myAction,
        createCustomApiCallAction({
            baseUrl: () => 'https://api.example.com/v1',
            auth: myAppAuth,
            authMapping: async (auth) => ({
                Authorization: `Bearer ${auth.secret_text}`,
            }),
        }),
    ],
    triggers: [myTrigger],
});
```

---

## UX Quality: Easy for Non-Technical Users

Blocks are used by people who have never seen an API — props, dropdowns, and descriptions must be self-explanatory.

1. **Never ask users to type IDs** — Use dynamic dropdowns so they pick items by name (`"Jane Doe (jane@x.com)"` not `"cus_abc123"`).
2. **Descriptions must teach** — Don't say "Enter the thread timestamp." Say "Click the three dots next to the message, select Copy Link, and paste the number at the end."
3. **Use Markdown instructions** for complex setup — Add `Property.MarkDown()` with numbered steps when a prop requires configuration in the third-party app.
4. **Set sensible defaults** — If 90% of users want the same value, make it the default.
5. **Plain language display names** — `"Create Contact"` not `"POST /contacts"`. Triggers: `"New Order"` not `"order.created webhook"`.
6. **Auth descriptions** must include step-by-step instructions to get the API key or set up OAuth.
7. **Helpful dropdown placeholders** — `"Please select a project first"` not empty.

Full patterns and examples: read `ux-guidelines.md`

---

## Output Quality: Table-Ready Data

Users pipe block outputs into Google Sheets and Intellisper Tables constantly — nested or inconsistent output breaks their flows.

1. **Flatten nested objects** — `{ user: { name: "Jo" } }` → `{ user_name: "Jo" }`.
2. **Arrays of records must have consistent flat keys** — same keys on every object so each maps to a column.
3. **Single-record actions** return a flat object. **List/search actions** return a flat array.
4. **Human-readable key names** — `company_name` not `cName`. These become column headers.

Full patterns and examples: read `output-quality.md`

---

## AI-Ready Metadata (Required on New Actions & Triggers)

- **`audience`** (actions only): `'human' | 'ai' | 'both'` — written explicitly on every action (`'both'` for normal integration actions; `'human'` for LLM-wrappers/utilities). Downstream filters only see it when physically present.
- **`aiMetadata`**: `{ description, idempotent }` on every action, `{ description }` on every trigger — agent-facing description (what + when-to-pick + key constraint) and safe-retry hint derived from `run()`.

The catalog is fully curated; a new action or trigger without these is a regression. Writing rules, `idempotent` derivation, factory gotchas: read `ai-metadata.md`

---

## Critical Reminders

1. **Register in `tsconfig.base.json`** — alphabetically in `compilerOptions.paths`. Build fails silently without this.
2. **Action/trigger `name` fields are permanent** — never change them after publishing; flows store them.
3. **Auth lives in `src/lib/auth.ts`** — define there, import in actions/triggers via `import { myAppAuth } from '../auth'`. Do NOT re-export from `index.ts`.
4. **Always provide `sampleData`** on triggers — even `{}`.
5. **Build AND lint must both pass** — lint failures (unused imports, `any`, unused vars) block CI even when build is green.
6. **Bump version on every existing-block change** — see Versioning above. Skipping means flows never get your fix.
7. **AI metadata on every new action & trigger** — explicit `audience` + `aiMetadata { description, idempotent }` on actions, `aiMetadata { description }` on triggers. See `ai-metadata.md`.

---

## When to Ask the User

Pause and ask if:

- OAuth2 authUrl/tokenUrl/scopes are missing from the API docs
- Auth method is unclear or undocumented
- More than 10 possible actions exist — ask which to prioritize
- API uses webhook signature verification
- You need test credentials or sandbox access
