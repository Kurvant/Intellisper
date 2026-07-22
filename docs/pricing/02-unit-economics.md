# Intellisper — Per-feature unit economics (Phase 2)

> Computed 2026-07-14 from the Phase 1 rate files (`01-rates-*.md`). Every number here
> derives from a verified rate × a stated assumption. Assumptions are the sliders in the
> Phase 3 interactive model — change them there, not here.

## A. Fixed monthly baseline (before any usage)

| Stack | Railway (current host) | Hetzner EU | Hetzner US |
|---|---|---|---|
| Starter (1 api + 1 worker + PG + Redis) | ~$101/mo | ~$10/mo | ~$73/mo |
| Growth (2× compute) | ~$237/mo | ~$28/mo | ~$147/mo |

Add-ons at low volume: S3/R2 ~$1–5, SES ~$1, Loki free tier $0, GitHub Packages $0*
(*until >1 GB/mo package transfer on free org — see risk in `01-rates-storage-platform.md` §4;
budget $4/user/mo GitHub Team or keep a card on file for $0.50/GB overage).

**Fixed baseline used in the model: $110/mo (Railway starter + add-ons).**

## B. Marginal cost per unit of usage

### B1. Flow run (core automation)
Assumption: 500 ms worker CPU, ~20 Redis commands, ~10 PG writes, 50 KB log stored 30 days.

| Component | Cost |
|---|---|
| CPU @ $7.6e-6/vCPU-s (Railway) | $0.0000038 |
| Redis (Upstash PAYG $0.20/100k cmds) | $0.00004 |
| Log storage (50 KB × 30 d, S3) | ~$0.0000006 |
| **Total per run** | **~$0.00005** |

→ 10,000 runs/mo ≈ **$0.50**. Upstream charges $5/mo per extra active flow — a ~100×
value markup over cost. Flow runs are priced on value, not cost.

### B2. Browser-agent session (the dominant marginal cost)
Assumptions (sliders): 25 LLM steps/session; 8K input + 500 output tokens/step; 75% of
input served from prompt cache; tier mix 80% Haiku / 15% Sonnet / 5% Opus; one Haiku
distill pass (20K in / 1K out); ~50K tokens embedded to memory.

| Tier | Steps | Input cost (cached+uncached) | Output cost | Subtotal |
|---|---|---|---|---|
| Haiku 4.5 (default) | 20 | $0.012 + $0.040 | $0.050 | $0.102 |
| Sonnet 4.6 (escalation) | 4 | $0.007 + $0.024 | $0.030 | $0.061 |
| Opus 4.6 (reasoning) | 1 | $0.003 + $0.010 | $0.013 | $0.026 |
| Distill (Haiku) | 1 | $0.020 | $0.005 | $0.025 |
| Embeddings (3-small) | — | $0.001 | — | $0.001 |
| **Typical session** | | | | **~$0.22** |

Scenario band:
- Light session (10 steps, all-Haiku, cached): **~$0.06**
- Typical (above): **~$0.22**
- No-cache worst case (same shape): **~$0.41**
- Heavy (60 steps, 15K ctx/step, more escalation): **~$0.90–1.20**
- Server browser runtime: **$0** (runs in the user's Chrome — "NEVER headless")

### B3. AI credits (flow AI steps via provisioned OpenRouter keys)
COGS per $1 of model usage = $1.00 + 5.5% credit-purchase fee ≈ **$1.055**.
Whatever we price a credit at, margin = price − 1.055 × USD value of the credit.
Upstream includes 200 credits in STANDARD — the model treats credit USD value as a slider.

### B4. Chat message (enterprise chat)
3K input / 500 output per message: Haiku tier **~$0.006**, Sonnet tier **~$0.017**,
Opus tier **~$0.028**. 1,000 Sonnet messages/mo ≈ $17.

### B5. Knowledge-base ingestion
100-page PDF (~50K tokens): embeddings $0.001 + parse CPU ~$0.0001 + pgvector ~200 KB
storage (negligible). **Ingestion ≈ free; charge for it only as an abuse gate.**

### B6. Storage-type features (tables, files, todos, MCP config)
PG/S3 storage at $0.015–0.35/GB-mo → **< $0.01 per user per month** at any sane quota.

### B7. Enterprise features (SSO, RBAC, audit logs, analytics, git sync, embedding SDK, SCIM, secret managers, global connections)
Marginal cost ≈ **$0** (PG rows + queries). Only audit logs scale with usage:
100k events/mo ≈ 100 MB ≈ $0.002/mo. **Price on value/segmentation, not cost.**
Custom domains: $0 for first 100 hostnames (Cloudflare for SaaS), then $0.10/mo each.

### B8. Platform overhead per paying customer
- Stripe on a $25/mo sub: $0.30 + 3.6% = **$1.20 (4.8%)**; intl/FX up to ~8%.
- Email: ~10 sends/user/mo on SES ≈ **$0.001**.

## C. Representative monthly customer profiles (COGS)

| Profile | Usage | Marginal COGS | On $25/mo price |
|---|---|---|---|
| Light individual | 5 flows, 500 runs, 5 agent sessions, $0.50 AI credits | ~$1.70 | 93% gross margin* |
| Typical individual | 10 flows, 2k runs, 20 agent sessions, $1 credits | ~$6.80 (incl. $1.20 Stripe) | 73% |
| Power individual | 25 flows, 10k runs, 100 agent sessions, $3 credits | ~$26.90 | **negative** |
| Team (5 users, Sonnet chat) | 50 flows, 25k runs, 150 sessions, 2k chat msgs, $10 credits | ~$81 | needs ≥$120/mo pricing |

*before fixed-cost allocation.

## D. Load-bearing conclusions for pricing design

1. **Browser-agent sessions are the unit to meter.** At ~$0.22/typical session they are
   10,000× a flow run. Every plan needs a session (or agent-token) cap; the power-user
   profile goes underwater at $25/mo without one.
2. **Cache discipline is worth ~2×.** Cached vs uncached session cost is $0.22 vs $0.41.
   Stable system prompts / tool lists in the agent engine directly protect margin.
3. **Tier routing is worth ~3×.** All-Sonnet sessions would cost ~$0.66; the
   Haiku-default/escalation design keeps it at ~$0.22. Keep escalation rates observable.
4. **Everything else is noise or fixed.** Flow runs, storage, KB, email, enterprise
   features: price them on value. Only AI credits (COGS = 1.055× face value) and Stripe
   (~5–8% of revenue) matter arithmetically.
5. **Break-even on fixed costs** at $25/mo, typical-individual mix (~$18 contribution
   margin): **~6 customers on Railway starter; ~1 on Hetzner EU.**
6. **Ops risk:** free-org GitHub Packages transfer (1 GB/mo) can hard-fail worker block
   installs after a cache wipe/redeploy — put a card on file or move to Team before launch.
