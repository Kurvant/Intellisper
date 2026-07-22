# C4c — feature triage under the security constraint

**Owner constraint (hard requirement):** do NOT document anything sensitive or that widens cyber attack
surface. Never reveal sensitive information. Rules set by the owner:
- EXCLUDE entirely: internal/operator surfaces, secrets & auth internals, security-control mechanics,
  infra/deploy internals.
- For a user-facing feature with a sensitive underbelly → document the **user-facing surface only**
  (what the user does), omit all internal mechanics.
- Borderline (unsure if documenting helps users vs. widens attack surface) → **SKIP and list here** for
  the owner to decide. Never guess.

## Decisions

### ✅ SAFE to document (user-facing, low attack-surface)
| Feature | Scope of the page (user-facing only) |
|---|---|
| **Tables** | Create/list/edit tables & records, fields, export, table webhooks. Already a PUBLIC API surface (in the shipped OpenAPI spec). |
| **Alerts** | What alerts are, the notification behaviour, who receives them. Behaviour only — no transport/config internals. |
| **Leaderboard / Impact analytics** | ⚠️ No clear server surface found by name; may be frontend-only. → moved to SKIP+LIST (don't guess). |
| **Platform Copilot** | The in-app AI assistant: what it helps with, that it can use your memory. User-facing only; no prompt/MCP-credential internals. |
| **Formula** | Table formula fields — user-facing authoring only. (Verify it's a real shipped surface first.) |

### 🟡 USER-FACING SURFACE ONLY (has a sensitive underbelly — omit internals)
| Feature | Document | OMIT (sensitive) |
|---|---|---|
| **AI Spend / usage** | "See your AI spend and usage in the dashboard." | AI Gateway routing, managed-key mechanics, the usage ledger internals, OpenRouter wiring. |
| **Chat Analytics** | What the analytics dashboard shows an admin. | Retention/prune internals, metric pipeline. |
| **Knowledge Base** | Upload a document, it becomes searchable; ask questions over it. | Chunking/embedding pipeline, storage keys, vector internals, ingestion routes. |
| **Chat / Chat-with-AI** | Chat with an assistant in-app. | Sandbox mechanics, compaction internals, model routing. |
| **Plans & entitlements reference** | Plan tiers and what each includes; cap conventions (0 = not included → upgrade; unlimited). | The resolver's fail-closed/fail-open behaviour and any probing detail (security-control mechanic). |

### ⛔ SKIP — SECURITY (excluded per owner rule; not documented)
| Feature | Why excluded |
|---|---|
| **Managed Auth** | Secrets & auth internals. |
| **Egress Proxy** | Infra/deploy internals + SSRF control mechanics. |
| **Event Destinations** | Infra internals (worker job; also a phantom HTTP API — see M4 findings). |
| **OAuth Apps** | Auth internals + secrets. |
| **Operator / cross-tenant activity** (Tier 3) | Operator-key-gated internal surface (already excluded in C4). |
| **Secret managers, signing keys, SSRF allowlists, sandbox internals** | Security-control mechanics / secrets. |

### 📋 SKIP + LIST for owner decision (borderline)
| Feature | The question for the owner |
|---|---|
| **License Keys** | Activating a license is arguably user-facing, but the validation/entitlement flow is auth-adjacent. Document "how to apply a license key" only, or skip? |
| **Leaderboard / Impact analytics** | No clear backend surface found by name — is this a shipped, user-facing feature to document, or frontend-only / not shipped? |
| **Formula** | Confirm it's a shipped, user-facing table capability before documenting. |

**Approach:** author the ✅ SAFE and 🟡 user-facing-only pages, each traced narrowly (no pulling sensitive
internals into scope). Do NOT author the ⛔ or 📋 items. Report the 📋 list to the owner.

---

## ✅ C4c STATUS — DONE (2026-07-20), build GREEN

**11 pages authored, all user-facing-only, all code-traced, zero sensitive internals:**
- **Tables** (Studio): overview, fields-and-records (TEXT/NUMBER/DATE/DROPDOWN), table-webhooks
  (RECORD_CREATED/UPDATED/DELETED). Already a public API surface.
- **Knowledge base** (Studio): overview — upload/list/search/delete only; ingestion/embedding/chunk
  internals OMITTED.
- **Assistants** (Studio): copilot (uses memory), chat (conversations, streaming, stop) — sandbox/
  compaction/model-routing internals OMITTED; chat API stays non-public (M4 decision).
- **Admin observability** (Admin Guide): ai-usage, chat-analytics (aggregate only — gateway/ledger
  internals OMITTED), alerts (email on production run failure, deduped first-failure/24h).
- **Plans & entitlements** (Admin Guide): plan model + cap conventions (0=not included→upgrade,
  unlimited) — the resolver's fail-closed/fail-open behaviour OMITTED per security rule.
Wired via `authoredAdditions` (sidebars-authored.ts) spliced into studio + admin-guide sidebars.

**Formula: already documented** — `flows/using-formulas` + `flows/formula-reference` exist (legacy port).
Removed from C4c; COVERED. (C3 will verify accuracy.)

## ⛔ NOT documented (security exclusions applied — final)
Managed Auth, Egress Proxy, Event Destinations, OAuth Apps, operator/cross-tenant surfaces, secret
managers, signing keys, SSRF allowlists, sandbox internals — excluded per owner hard requirement.

## 📋 FOR OWNER DECISION (skipped, not guessed):
1. **License Keys** — document only "how to apply a license key" (user-facing activation), or skip
   entirely? The validation/entitlement flow is auth-adjacent and was excluded.
2. **Leaderboard / Impact analytics** — no backend surface found by name. Shipped user-facing feature to
   document, or frontend-only / not shipped? Need a pointer to confirm before writing anything.
3. **AI usage / Chat analytics depth** — I kept these deliberately high-level (metrics exist, why they
   matter). If you want more detail, confirm what's safe to show.
