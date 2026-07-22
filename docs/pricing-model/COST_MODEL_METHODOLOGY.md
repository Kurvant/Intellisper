# Intellisper — Unit-Economics (COGS) Model: Methodology & Assumptions

> Bottom-up cost-of-goods model for **both halves** of the product: the automation
> platform (flows) and the browser agent. **Cost first** — pricing is a later
> exercise. Every rate is an editable, sourced assumption.
>
> Companion artifacts:
> - **Interactive model** (editable, live recompute, CSV export): published as a
>   Claude Artifact — see the conversation, or re-open `cogs-model.html`.
> - **Spreadsheet**: `cost-model.csv` (this folder) — same numbers, spreadsheet-native.

---

## 1. What this models, and why it's structured this way

Designing pricing is a product + finance exercise. Before pricing, you need to know
what each feature **costs to serve**. This model:

1. Enumerates **every metered/costed feature** of both products.
2. Attaches each to its **cost drivers** (AI tokens, embeddings, compute, storage,
   egress, DB, Redis, email).
3. Prices each driver with a **researched market rate** (mid-2026, cited).
4. Layers in **usage-shape assumptions** (turns/task, sources/research, etc.) that
   the code bounds but does not measure.
5. Rolls features up into **representative workflows** and a **representative
   user-month**, and reports **marginal** and **fully-loaded** COGS.

### The six metered dimensions (the system's own units)
The browser agent already defines six monthly, per-**platform**-pooled usage
counters (`browser_agent_usage_counter`, `AgentUsageMetric`):

`ACTIONS · RESEARCH · FILE_OPS · ROUTINE_RUNS · QUICK_TOOLS · MEMORY_OPS`

The model computes a $ COGS for each, so it maps **1:1** onto how usage is (or, in
Phase 9, will be) metered. *(Note: the counter table exists but is not yet written
to in code — enforcement is Phase-9-stubbed. There is therefore no production usage
telemetry today; the usage-shape estimates below are the largest source of error.)*

---

## 2. Three kinds of input (badged in the interactive model)

| Badge | Meaning | Trust |
|---|---|---|
| `code` | A constant verified in the blockunits source | Exact |
| `src`  | A researched, cited market rate (mid-2026) | High (rates drift) |
| `est`  | A usage-shape assumption not present in code | **Scrutinize these** |

**Where to focus:** the `est` inputs (turns/task, tokens/turn, cached fraction,
escalation rate, batch self-heal rate, etc.). They are unknowable without real
telemetry. Replace them with measured `AgentRun.tokenCost` / `stepCount` data once
traffic exists — the same approach the sibling repo's `billing-cost-report.ts` took.

---

## 3. Code-verified cost mechanics (the `code` inputs)

All verified in `packages/server/api/src/app/browser-agent/`:

- **Token accounting** (`model-provider.service.ts`):
  `billedTokens = uncachedInput + cachedInput × 0.1 + output`
  (`CACHE_READ_WEIGHT = 0.1`). Re-sent context bills at **10%** thanks to Anthropic
  prompt caching (a whole-prefix ephemeral breakpoint each call).
  `callWithTools` = **exactly one** model turn.
- **Run bounds** (`runtime/browser-agent-runtime.service.ts`):
  `MAX_STEPS = 25` turns · `COST_CEILING = 200,000` billed tokens · `HISTORY_LIMIT = 16`.
- **Model tiers** (`model-provider.config.ts`, all env-overridable defaults):
  default `claude-haiku-4-5` · escalation `claude-sonnet-4-6` · reasoning
  `claude-opus-4-6` (gated; **disabled today** — `reasoningAllowed = false`) ·
  fallback `gpt-4o` · distill `claude-haiku-4-5`. Embeddings
  `text-embedding-3-small`, **1536-dim**.
- **Escalation** (`tier-router.ts`): stall-based. 0 stalls → default; ≥1 → Sonnet;
  ≥2 & allowed → Opus (off today).
- **Research** (`web-fetch.service.ts`, runtime): source cap **6** (+4/expansion,
  ≤3 → ≤18); fetch ≤ **2 MB** / **12 s**; distill `maxTokens 800`; compile
  `maxTokens 2000`.
- **Grammar** (`grammar.service.ts`): distill tier, input ≤ 12k chars.
- **Memory** (`memory.service.ts`): 1 embedding per remember/recall; dedupe ≤ 0.08;
  recall K by tier (free 3 / pro 5 / enterprise 8). pgvector + HNSW index.
- **Routine replay** (`runtime`): `REPLAY_MAX_STEPS = 40`, heal ≤ 2, retry ≤ 2.
  **Deterministic replay = 0 model turns on the happy path** — AI fires only to
  self-heal a changed selector or evaluate a fuzzy condition.
- **Automation** (`automation/*`): batch caps default `maxBatchRows = 500`,
  `maxConcurrentRows = 3`; `maxSchedules = 10`. Presence via Redis (90 s TTL).
- **Flow run** (platform, `system.ts`): `FLOW_TIMEOUT_SECONDS = 600`, sandbox
  memory 1 GB, log cap 50 MB, retention 30 days, zstd logs to S3/DB.
- **In-flow AI**: billed via the platform `ai_provider` stack; auto-provisioned
  "Intellisper" provider = **OpenRouter**, **1000 credits = $1**. KB embeddings
  **768-dim** (distinct from the agent's 1536-dim memory).

---

## 4. Researched market rates (the `src` inputs, mid-2026)

All editable; replace with your contracted rates. See `cost-model.csv` for the
full table with sources.

### AI token prices ($/1M tokens)
| Model / tier | Input | Output | Cache-read |
|---|---|---|---|
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 |
| Claude Sonnet (4.6 / 5 std) | $3.00 | $15.00 | $0.30 |
| Claude Opus 4.5–4.8 | $5.00 | $25.00 | $0.50 |
| GPT-4o | ~$2.50 | ~$10.00 | — |
| text-embedding-3-small | $0.02 | — | — |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | $0.025 |
| Gemini 2.5 Pro (≤200k) | $1.25 | $10.00 | $0.125 |
| Mistral Small 4 | $0.15 | $0.60 | — |
| Mistral Large 3 | $0.50 | $1.50 | — |
| OpenRouter | provider list **+ ~5.5%** surcharge | | |

**Provider-agnostic blended tiers** (equal-weight Anthropic + OpenAI + Google, so no
single provider dominates — the model's default):

| Tier | Input $/1M | Output $/1M |
|---|---|---|
| small (default / distill / grammar) | **$0.50** | **$2.00** |
| mid (escalation) | **$2.25** | **$11.50** |
| large (reasoning, off today) | **$10.00** | **$45.00** |
| embeddings | **$0.06** | — |

### Infrastructure (AWS)
| Item | Rate | Unit |
|---|---|---|
| S3 Standard storage | $0.023 | /GB-mo |
| S3 PUT / GET | $0.005 / $0.0004 | /1k requests |
| Data egress | $0.09 | /GB (first tier) |
| Fargate vCPU / memory | $0.0405 / $0.00445 | /vCPU-hr / /GB-hr |
| RDS gp3 storage | $0.115 | /GB-mo |
| RDS instance (mid) | ~$0.30/hr (~$220/mo) | editable |
| ElastiCache Redis (mid) | ~$0.155/hr (~$115/mo) | editable |
| Email (SES) | $0.0001 | /send |

> RDS/ElastiCache **hourly** figures were not confirmable from a live primary page in
> the research pass (aggregators are JS-rendered); they are standard on-demand
> anchors, marked editable. They are **amortized fixed costs** — their exact value
> barely moves per-action COGS. Plug your real contract.

---

## 5. Per-feature COGS formulas

Let `call(tier, in, out, cache)` = `in·(1−cf)·Rin + in·cf·0.1·Rin + out·Rout`
where `cf` = cached fraction (0 if `cache=false`), `Rin/Rout` = $/token for the tier.

| Feature (meter) | Formula (marginal) |
|---|---|
| **Interactive task** (ACTIONS) | `steps · [(1−esc)·call(small) + esc·call(mid)] + toolCalls·call(small) + steps·emb(mem)` |
| **Research run** (RESEARCH) | `sources·call(small, src_in, 800) + call(small, sources·400, 2000) + egress` |
| **Memory op** (MEMORY_OPS) | `emb(mem_tokens) + tiny DB` |
| **Grammar** (QUICK_TOOLS) | `call(small, gram_in, gram_out)` |
| **File op** (FILE_OPS) | `S3 PUT + storage delta + (edit? call(small) : 0)` |
| **Batch row / replay** (ROUTINE_RUNS) | `steps·healRate·call(small, heal_in, heal_out) + tiny DB` — **0 AI on happy path** |
| **Flow run (no AI)** | `secs·(vCPU·Rvcpu + memGB·Rmem)/3600 + logMB·Rsto + egress` |
| **Flow run (with AI)** | above `+ in-flow AI credits` |
| **KB query** | `emb(768-dim) + tiny DB` |

**Browser action cost = $0** — actions execute on the user's own extension/session.

**Fully-loaded** COGS = marginal + `(RDS + Redis + compute + other) / active_users`.

---

## 6. The structural margin lever (the headline finding)

Two architectural facts dominate the economics:

1. **Unattended/batch runs execute on the user's own machine** via their extension —
   never a headless cloud browser. Our browser-compute cost ≈ **$0**.
2. **Deterministic routine replay uses zero model turns on the happy path.** AI fires
   only to self-heal a changed selector.

⇒ A **batch of 200 rows costs a tiny fraction of 200 interactive agentic tasks.**
This is the biggest differentiator versus cloud-browser competitors, and pricing
should lean into it (cheap unattended/at-scale runs; interactive agentic chat is the
token-heavy, higher-COGS surface).

---

## 7. Caveats & things to fix with real data

- **No production telemetry yet.** The `usage_counter` is defined but unwritten
  (Phase 9). The `est` inputs are the largest error source — replace with measured
  `AgentRun.tokenCost` / `stepCount` once traffic exists.
- **Un-metered sub-calls.** Server tool calls (page-intelligence, compileReport)
  currently do **not** add to a run's recorded `tokenCost` in code — real per-task AI
  cost is a bit higher than the DB figure. This model captures them via the
  "server tool sub-calls / task" assumption.
- **Not modeled by default:** Batch-API 50% discounts, Anthropic cache-write
  surcharges (1.25×/2×), tiered egress/storage volume discounts, reserved-instance /
  committed-use savings. Add them as you commit spend.
- **Rates drift.** AI and cloud pricing change often; re-verify quarterly.

---

## 8. How to use it

1. Open the interactive model. Set the **`est`** assumptions to your best guess (or
   measured data). Set **`active_users`** to amortize fixed infra.
2. Read **Per-feature COGS** to see each unit cost and its cost stack (which driver
   dominates).
3. Use **Representative workflows** to price composite jobs.
4. Use **User-month roll-up** for blended COGS/user and a gross-margin check against
   any candidate price.
5. **Export CSV** to hand finance a spreadsheet.

*This is a model, not a bill. Every number is an assumption you can and should
challenge.*
