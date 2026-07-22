# Intellisper AI Gateway — Design

**Status:** design locked, implementation in progress
**Goal:** one trustworthy, platform-owned ledger of every AI call and what it *actually cost us*,
so pricing and margin can be set from measured fact instead of estimate.

---

## 0. Why this exists

AI inference is our largest variable cost. Today we cannot answer, for any window:

- what did we spend, in USD?
- on which product surface (browser agent / Studio chat / a flow block)?
- for which customer?
- on which model?
- and what did we *charge* for it — i.e. what is the gross margin?

The `ai_usage` table that once existed was **dropped** (migration
`1766015156683-DropLegacyTables`). There is **no per-token price map anywhere in the repo**.
What we call "AI credits" today is not a measurement we own: it is a read-through of
OpenRouter's key ledger (`openRouterApi.getKey()` → `usage`, `limit_remaining`) at a flat
1000 credits = $1 USD.

That has two consequences, and both cost money:

1. **Every non-OpenRouter call is invisible and free-to-us-on-paper.** Anthropic-direct,
   OpenAI-direct, Bedrock, Azure, and Gemini calls contribute **exactly zero** to credits.
2. **We cannot attribute.** OpenRouter's number is one bucket per platform key. It cannot
   tell us that (say) the browser agent's research tool is 60% of a customer's spend.

The gateway closes both.

---

## 1. Decision: middleware, not a proxy

The originating spec called for routing all traffic through a **self-hosted Portkey Gateway**.
We are **not** doing that, for reasons that are load-bearing:

| | Proxy hop (Portkey) | Middleware (chosen) |
|---|---|---|
| Added latency / call | one extra network hop, always | **none** |
| New failure mode | proxy down ⇒ **all AI is down** | ledger down ⇒ AI unaffected |
| Ops surface | a new container to run, scale, monitor | none |
| Coverage | only what we can re-point at it | every plane, incl. the sandboxed engine |
| Token data | re-parsed from the proxied stream | read from the SDK's own typed usage |

The AI SDK (`ai@6.0.170`, verified in `node_modules`) exports **`wrapLanguageModel`**,
**`wrapEmbeddingModel`**, and **`wrapProvider`**. Every one of our four execution planes builds
its model through a factory function we control. So we wrap at construction, read the usage the
provider **already returns** on the response we are **already awaiting**, and emit it to an async
sink. There is nothing to proxy.

**Latency added to the user's request path: zero.** The middleware does no I/O. It reads an
object that is already in memory and hands it to an in-process buffer. The DB write happens
after the response has been returned.

> Portkey is not foreclosed. Every provider is constructed with a `baseURL` we own in config,
> so a gateway can be introduced later as a config change, not a rewrite. We just refuse to put
> one in the hot path to obtain data we can already read for free.

---

## 2. The four planes

Nothing is metered end-to-end today. All four must be captured or the ledger lies by omission.

| # | Plane | Process | Model factory (the single funnel) | Today |
|---|---|---|---|---|
| A | Browser agent | **API** | `buildModel()` in `browser-agent/model-provider/model-provider.service.ts` | `billedTokens` → `browser_agent_run.tokenCost`; **no USD, no per-call row** |
| B | Studio chat agent | **worker** | `createChatModel()` in `server/utils/src/chat-ai-utils.ts` | tokens computed then **`log.info`'d and discarded** |
| C | Flow `ai` blocks | **engine** (sandbox) | `createAIModel()` / `createEmbeddingModel()` in `blocks/community/ai/src/lib/common/ai-sdk.ts` | **nothing** |
| D | 3rd-party LLM blocks | engine | user's *own* connection key, raw SDK | **out of scope — not our cost** |

Plane D is deliberately excluded: those calls are billed to the customer's own vendor account.
They are not our COGS. Metering them would inflate our cost picture with money we never spent.
(We can surface them as *customer* usage later; that is a different ledger.)

---

## 3. Cost model — provider first, computed as fallback

**The provider is the source of truth.** We only compute when the provider doesn't tell us.

Every ledger row records **`costSource`**, so no report ever blends measured and estimated
money without saying so.

### 3.1 Provider-reported (authoritative)

OpenRouter, with `providerOptions.openrouter.usage.include = true` (already enabled in the
browser agent), returns on the response:

```ts
providerMetadata.openrouter.usage: {
  promptTokens, promptTokensDetails?: { cachedTokens },
  completionTokens, completionTokensDetails?: { reasoningTokens },
  totalTokens,
  cost?: number,                                  // ← USD. authoritative.
  costDetails?: { upstreamInferenceCost: number },
}
```

When `cost` is present → `costSource = 'provider'`, and `costUsd` is taken verbatim.
This is exact, and it self-corrects when a vendor changes rates. It costs us **no extra call**.

### 3.2 Computed (fallback)

For direct-vendor paths (Anthropic, OpenAI, Bedrock, Azure, Gemini) no cost is returned, so we
price it ourselves from token counts × a **versioned, effective-dated price table**.

The AI SDK normalizes token detail across providers:

```ts
usage.inputTokenDetails: { noCacheTokens, cacheReadTokens, cacheWriteTokens }
usage.outputTokenDetails: { reasoningTokens }
usage.raw                                          // provider's verbatim usage payload
```

**This corrects a real error in the source spec.** The spec said to apply "a 90% cost reduction
on `cached_tokens`". That is only true of cache **reads**. Anthropic charges a **25% premium** to
**write** a cache entry — and the browser agent writes a cache breakpoint on *every single turn*.
Billing cache writes at a 90% discount would have systematically **under-reported our single
largest agent cost**. We therefore price four distinct token classes:

```
cost = noCacheTokens    × inputRate
     + cacheWriteTokens × inputRate × 1.25     ← premium, NOT a discount
     + cacheReadTokens  × inputRate × 0.10     ← the only discounted class
     + outputTokens     × outputRate
```

Rates live in a table keyed by `(provider, model, effectiveFrom)`. Every row stores the
**`priceVersion`** used, so a rate change is never applied retroactively by accident, and any
historical window can be re-costed deliberately.

If a model is unknown to the table: we **do not guess a price**. We write the row with
`costUsd = 0`, `costSource = 'unpriced'`, and the raw tokens. It shows up in the dashboard as
*unpriced volume* — a visible gap, never a silent zero folded into a margin number. Silence is
what makes reports lie; a loud zero does not.

---

## 4. Ledger schema

One table. Raw metrics stored **separately** from money, so cost can be recomputed retrospectively.

```sql
CREATE TABLE "ai_usage_ledger" (
    "id"                UUID PRIMARY KEY,
    "created"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- attribution
    "platformId"        VARCHAR(21) NOT NULL,      -- tenant (always present, always filtered on)
    "projectId"         VARCHAR(21) NULL,
    "userId"            VARCHAR(21) NULL,
    "feature"           VARCHAR(64) NOT NULL,      -- browser_agent | studio_chat | flow_block | ...
    "featureRef"        VARCHAR(64) NULL,          -- runId / conversationId / flowRunId
    -- what was called
    "provider"          VARCHAR(64) NOT NULL,
    "model"             VARCHAR(128) NOT NULL,
    "modality"          VARCHAR(16) NOT NULL,      -- text | embedding
    -- raw truth (never derived)
    "inputTokens"       INT NOT NULL DEFAULT 0,    -- non-cached input
    "outputTokens"      INT NOT NULL DEFAULT 0,
    "cacheReadTokens"   INT NOT NULL DEFAULT 0,
    "cacheWriteTokens"  INT NOT NULL DEFAULT 0,
    "reasoningTokens"   INT NOT NULL DEFAULT 0,
    -- money (derived; recomputable from the above)
    "costUsd"           NUMERIC(14,8) NOT NULL DEFAULT 0,   -- what WE pay (COGS)
    "costSource"        VARCHAR(16) NOT NULL,               -- provider | computed | unpriced
    "priceVersion"      VARCHAR(32) NULL,                   -- null iff costSource='provider'
    "billedCredits"     INT NOT NULL DEFAULT 0,             -- what the CUSTOMER was charged
    -- integrity
    "requestId"         VARCHAR(128) NULL,
    "idempotencyKey"    VARCHAR(128) NOT NULL,              -- UNIQUE. kills double-counting.
    "meta"              JSONB NULL
);

CREATE UNIQUE INDEX "idx_ai_ledger_idem"    ON "ai_usage_ledger" ("idempotencyKey");
CREATE INDEX "idx_ai_ledger_platform_time"  ON "ai_usage_ledger" ("platformId", "created" DESC);
CREATE INDEX "idx_ai_ledger_feature_time"   ON "ai_usage_ledger" ("platformId", "feature", "created" DESC);
```

**Why `NUMERIC(14,8)` and not the spec's `NUMERIC(12,6)`:** a single cheap call (Haiku,
~200 tokens) costs on the order of `$0.00008`. At 6 decimal places that rounds toward zero and a
million such calls aggregate to a materially wrong number. Eight places holds it exactly.

**Why the spec's `billed_price_usd INT` is dropped:** an *integer* USD column cannot represent
any price below a dollar. Every per-call charge we make is below a dollar. We store customer
charge as `billedCredits` (integer credits — which *is* the unit we bill in, 1000 = $1), and
leave USD to the `NUMERIC` COGS column.

**Idempotency is the anti-double-count guarantee.** A retried worker job, a re-delivered
report, or an at-least-once queue can each present the same call twice. The unique index makes
the second write a no-op (`ON CONFLICT DO NOTHING`). Double-counted spend is the exact class of
"misleading report" that gets expensive, so it is enforced by the database, not by hope.

---

## 5. Write path — asynchronous, bounded, lossless-on-shutdown

```
[ model call returns ]
        │  (usage already in memory — no I/O)
        ▼
[ ledger middleware ] ──emit──► [ in-process buffered sink ]
        │                              │  flush on: 200 rows | 2s | shutdown
        ▼                              ▼
[ response to user ]            [ single multi-row INSERT .. ON CONFLICT DO NOTHING ]
```

Rules the sink obeys:

- **Never in the request path.** The middleware `emit()` is synchronous, non-blocking, and
  returns immediately. The user's response never waits on the ledger.
- **Bounded.** The buffer has a hard cap. If the DB is unreachable and the buffer fills, we
  **drop and count the drops** (and log loudly) rather than grow memory without limit. A
  telemetry system must never be able to OOM the product it observes.
- **Never throws into the caller.** A ledger failure can degrade the ledger. It cannot degrade
  inference.
- **Drains on shutdown** so a normal deploy loses nothing.
- **Batched.** One `INSERT` per flush, not one per call — so cost accounting adds negligible DB load.

Cross-process planes (worker, engine) reuse the **existing** report channels back to the API
rather than opening new ones; usage is attached to the reports those processes already send,
fire-and-forget.

---

## 6. Read path

Aggregations over `(platformId, feature, model, window)` returning, per group:
tokens, **COGS** (`costUsd`), **revenue** (`billedCredits` → USD), and **margin**, plus an
explicit **unpriced-volume** figure so an incomplete price table is visible rather than silently
booked as 100% margin.

Surfaced in the existing **React + Vite** admin (`packages/web`) — this repo is *not* Next.js, so
there are no server components; the read layer is a normal query hook feeding the existing
table/card primitives.

---

## 7. Leaks this closes (found during design)

1. `browser-agent/tools/research.tools.ts:33` calls `browserAgentModelProvider(scope.log)` with
   **no `platformId`** — so it always falls back to the ENV key and is **never billed to the
   customer's credit pool**. Real, live revenue leak.
2. `browser-agent/memory/browser-agent-memory.service.ts` embeddings always use the env OpenAI
   key — same leak, plus invisible cost.
3. `model-provider.service.ts:mapUsage()` reads `usage.cachedInputTokens`, which the installed SDK
   marks **`@deprecated`** in favour of `inputTokenDetails.cacheReadTokens`, and which does not
   distinguish cache **writes** at all — so today's `billedTokens` under-counts cache-write cost.
4. Studio chat (worker) computes token totals and **discards them** into a log line.
