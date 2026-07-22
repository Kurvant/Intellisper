# Rate card — Anthropic token pricing (Phase 1, unit 1)

> Source: Anthropic official model/pricing table (bundled Claude API reference, cached 2026-06-24;
> cross-check at https://platform.claude.com/docs/en/pricing before finalizing the model).
> Recorded 2026-07-13.

These are the browser-agent tier models configured in
`packages/server/api/src/app/browser-agent/model-provider/model-provider.config.ts`.

| Tier (browser agent) | Model ID | Input $/1M tok | Output $/1M tok |
|---|---|---|---|
| default + distill | `claude-haiku-4-5` | $1.00 | $5.00 |
| escalation | `claude-sonnet-4-6` | $3.00 | $15.00 |
| reasoning | `claude-opus-4-6` | $5.00 | $25.00 |

Also relevant (not currently configured, for scenario planning):

| Model | Input $/1M | Output $/1M |
|---|---|---|
| `claude-sonnet-5` | $3.00 ($2.00 intro through 2026-08-31) | $15.00 ($10.00 intro) |
| `claude-opus-4-8` | $5.00 | $25.00 |

**Prompt caching economics (matters a lot for agent loops):**
- Cache reads ≈ 0.1× base input price; cache writes 1.25× (5-min TTL) or 2× (1-h TTL).
- Browser-agent sessions are multi-turn tool loops → assume 60–90% of input tokens are
  cache reads in steady state. Model both cached and uncached scenarios.
- Batch API = 50% off both directions (usable for distillation jobs, not live sessions).

Open items (covered by other rate files):
- OpenAI: `gpt-4o` (fallback tier) + `text-embedding-3-small` (memory + KB embeddings) → `01-rates-ai-others.md`
- OpenRouter platform fees (AI-credit COGS path) → `01-rates-ai-others.md`
