# Rate card — non-Anthropic AI pricing (Phase 1)

Recorded: 2026-07-14

Scope: current public list prices for the non-Anthropic AI APIs in the blockunits cost model, plus a Bedrock-vs-Anthropic-direct parity check. Every number carries its source URL and the date it was verified. Numbers that could not be confirmed against a primary or consistently-corroborated source are marked **UNVERIFIED**.

---

## 1. OpenAI API

| Item | Input $/1M tokens | Output $/1M tokens | Notes |
|---|---|---|---|
| gpt-4o | $2.50 | $10.00 | Grandfathered/legacy since the GPT-4.1 launch (Jan 2026); existing integrations keep working at this price |
| text-embedding-3-small | $0.02 | n/a | 1536-dim (Matryoshka-truncatable to e.g. 768) |
| text-embedding-3-small (Batch) | $0.01 | n/a | 50% batch discount |

- **Batch discount:** OpenAI's Batch API runs at **50% of standard rates for most models** (24h turnaround). Confirmed on the official pricing page (verified 2026-07-14): https://developers.openai.com/api/docs/pricing
- **gpt-4o caveat:** gpt-4o and text-embedding-3-small are **no longer listed on OpenAI's current official pricing page** (it now shows only the GPT-5.x lineup). The $2.50/$10.00 figure is corroborated by multiple 2026 secondary sources (verified 2026-07-14):
  - https://pecollective.com/tools/gpt-4o-pricing/ ("$2.50/$10 per 1M Tokens")
  - https://gptbreeze.io/blog/gpt-4o-pricing-guide/
  - https://devtk.ai/en/blog/openai-api-pricing-guide-2026/
- **text-embedding-3-small $0.02/1M:** confirmed on the official model page (verified 2026-07-14): https://developers.openai.com/api/docs/models/text-embedding-3-small — batch $0.01 corroborated by https://tokenmix.ai/blog/openai-embedding-pricing and https://pecollective.com/tools/text-embedding-models-compared/

## 2. OpenRouter (platform fees)

| Fee | Current value | Notes |
|---|---|---|
| Credit purchase (card/Stripe) | **5.5%**, minimum **$0.80** | Charged on each non-crypto credit purchase |
| Credit purchase (crypto/Coinbase) | **5.0% flat**, no minimum | |
| BYOK (bring-your-own-key) usage | First **1M requests/month free**, then **5%** of what the same call would cost on OpenRouter | Enterprise plans raise the free threshold to 5M requests/month |
| Model inference markup | None — model prices are provider pass-through | Fees are on credit purchase + BYOK only |
| Provisioned/managed API keys | **No additional fee documented** beyond standard inference | Nothing in the FAQ indicates extra charges for provisioned keys |

- Source (primary): https://openrouter.ai/docs/faq — verified 2026-07-14. Corroborated by https://openrouter.ai/pricing and https://ofox.ai/blog/openrouter-pricing-hidden-markup-breakdown-2026/
- Change vs historical model: the old structure (~5% + $0.35 fixed fee on credit purchases; BYOK 5% with no free tier) has been replaced by 5.5%/min-$0.80 on card purchases and a 1M-request/month free BYOK tier.

## 3. Google Gemini API (flash tier)

Cheapest current flash-tier model: **Gemini 2.5 Flash-Lite**.

| Model | Input $/1M | Output $/1M | Notes |
|---|---|---|---|
| **Gemini 2.5 Flash-Lite** (cheapest) | **$0.10** | **$0.40** | Text/image/video input; audio input $0.30 |
| Gemini 2.5 Flash | $0.30 | $2.50 | |
| Gemini 3.1 Flash-Lite | $0.25 | $1.50 | Cheapest current-generation Lite |
| Gemini 3 Flash (preview) | $0.50 | $3.00 | |
| Gemini 3.5 Flash | $1.50 | $9.00 | Newest flash (May 2026) |

- **Batch:** 50% off list for all models (e.g. 2.5 Flash-Lite batch: $0.05 / $0.20).
- **Context caching:** ~90% off cached input (2.5 Flash-Lite cached input $0.01/1M + $1.00/1M-tokens/hr storage).
- Source (primary): https://ai.google.dev/gemini-api/docs/pricing — verified 2026-07-14.

## 4. Mistral API

| Model | Input $/1M | Output $/1M | Status |
|---|---|---|---|
| Mistral Small (small-latest) | $0.10 | $0.30 | **Partially verified** — see note |
| Mistral Medium 3.5 (current) | $1.50 | $7.50 | Verified via two aggregators (one updated 2026-07-14) |
| Mistral Medium 3 (prior) | $0.40 | $2.00 | Last-known official price for the older Medium |
| Mistral Large (reference) | $2.00 | $6.00 | Stated on Mistral's own pricing page |

- **Mistral's official pricing page does not publish per-token numbers for Small/Medium** (it only states "Mistral Large costs $2/M in and $6/M out") — https://mistral.ai/pricing/ , checked 2026-07-14.
- Mistral Small $0.10/$0.30: corroborated by https://www.aipricing.guru/mistral-ai-pricing/ (page updated 2026-07-14) and https://pricepertoken.com/pricing-page/provider/mistral-ai . **Conflicting data point:** https://www.cloudzero.com/blog/mistral-api-pricing/ (May 2026) lists "Small 4" at $0.15/$0.60 with "Small 3.2" at $0.08/$0.20. Treat Small as **UNVERIFIED at exact version level (last known official: $0.10/$0.30 for small-latest)**; use $0.15/$0.60 as the conservative bound in cost modeling.
- Mistral Medium 3.5 $1.50/$7.50: https://www.aipricing.guru/mistral-ai-pricing/ (updated 2026-07-14) and https://www.cloudzero.com/blog/mistral-api-pricing/ agree.
- Batch: Mistral offers a 50% batch discount (per https://www.cloudzero.com/blog/mistral-api-pricing/ , verified 2026-07-14).

## 5. AWS Bedrock — Anthropic model parity

**Conclusion: on-demand pricing for current Anthropic models on Bedrock matches Anthropic direct.**

| Model | Anthropic direct $/1M (in/out) | Bedrock $/1M (in/out) | Parity |
|---|---|---|---|
| Claude Opus 4.8 | $5.00 / $25.00 | $5.00 / $25.00 | ✅ match |
| Claude Sonnet 5 | $3.00 / $15.00 (intro $2.00 / $10.00 through 2026-08-31) | Same, incl. identical $2/$10 promo through Aug 31, 2026 | ✅ match |
| Claude Haiku 4.5 | $1.00 / $5.00 | Not individually re-verified on the AWS page | UNVERIFIED on Bedrock (last known: parity) |

- Anthropic direct prices: https://platform.claude.com/docs/en/pricing (per current Anthropic docs; cross-checked against Anthropic's model table, cached 2026-06-24, and https://platform.claude.com/docs/en/about-claude/pricing).
- Bedrock: https://aws.amazon.com/bedrock/pricing/ (fetched 2026-07-14) — the AWS page carries the **same Sonnet 5 promotional note verbatim** ($2/$10 through Aug 31, 2026, then $3/$15), and Opus 4.8 at $5/$25 is corroborated by https://pricepertoken.com/pricing-page/model/anthropic-claude-opus-4.8 and https://www.requesty.ai/models/bedrock/claude-opus-4-8-ap-northeast-1 .
- **Delta to note:** the AWS page lists some legacy **"Public Extended Access" Claude 3.5-era rows at a premium ($6/$30)** — extended availability of retired models is priced above direct. Current-generation models are at parity. Bedrock also offers 50% batch pricing, matching Anthropic's Batches API discount.

---

## Implications

- **Embedding runs are a rounding error:** text-embedding-3-small (1536-dim) at $0.02/1M means embedding 100M tokens (~a large tenant corpus) costs **$2.00** ($1.00 batched). Truncating to 768 dims (Matryoshka) does **not** change API cost — it only halves vector-DB storage/RAM, so the dimension decision is a storage/latency call, not an API-cost call.
- **gpt-4o fallback vs claude-sonnet:** gpt-4o ($2.50/$10) is nominally cheaper than Sonnet 5 list ($3/$15), but during the intro window (through 2026-08-31) Sonnet 5 at $2/$10 is **cheaper than gpt-4o** — and gpt-4o is legacy/grandfathered at OpenAI, so building a new fallback on it carries deprecation risk; budget against GPT-4.1-class pricing instead.
- **Cheap-tier routing:** for high-volume/low-stakes calls, Gemini 2.5 Flash-Lite ($0.10/$0.40) and Mistral Small (~$0.10/$0.30) are ~10x cheaper on input than Claude Haiku 4.5 ($1/$5); a router that sends classification/extraction traffic there cuts that line item by an order of magnitude.
- **OpenRouter adds ~5.5–10.5% overhead, not a markup on tokens:** model prices are pass-through, but every card credit purchase loses 5.5% (min $0.80), and BYOK traffic above 1M requests/month adds another 5% — so heavy BYOK usage through OpenRouter costs up to ~10.5% more than going direct.
- **Batch everything batchable:** OpenAI, Gemini, Mistral, and Anthropic (direct and on Bedrock) all offer ~50% batch discounts — any non-interactive pipeline (embeddings, nightly summarization, bulk classification) should be architected batch-first, halving that entire cost category. Bedrock parity means AWS-native deployment of Claude carries no price penalty.
