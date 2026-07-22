# Rate card — infrastructure hosting (Phase 1)

Recorded: 2026-07-14

Scope: Node.js/Fastify API container + CPU-bound worker container + static web frontend + Postgres 16 w/ pgvector + Redis 7. Current deployment: Railway (incl. Postgres). All prices USD unless noted, excl. VAT/tax. Every figure carries a source URL and the date it was checked; anything not confirmed against a primary source is marked **UNVERIFIED**.

---

## 1. Railway (current host)

Usage-based, billed per second on actual consumption (not provisioned size). Databases (Postgres, Redis) run as ordinary services and are billed at the same compute + volume rates. Railway's Postgres template image ships with pgvector available (**UNVERIFIED** — confirm `CREATE EXTENSION vector;` on the current instance; it works on Railway's standard `pgvector/pgvector` based template but depends on which image the project deployed).

| Item | Price | Notes |
|---|---|---|
| vCPU | **$20 / vCPU / month** ($0.000463 / vCPU / minute) | ≈ $0.0278/vCPU-hour; billed per second on usage |
| RAM | **$10 / GB / month** ($0.000231 / GB / minute) | ≈ $0.0139/GB-hour |
| Volume storage | **$0.15 / GB / month** | persistent volumes (Postgres data, etc.) |
| Network egress | **$0.05 / GB** | service egress |
| Hobby plan | $5/month, includes $5 usage | |
| Pro plan | $20/month per seat, includes $20 usage | |

Source: https://docs.railway.com/pricing/plans (verified 2026-07-14); corroborated by https://railway.com/pricing (verified 2026-07-14 — page confirms per-second billing model; exact rates confirmed on the docs page).

---

## 2. Hetzner Cloud (budget floor)

**Important:** Hetzner raised prices effective 15 June 2026 (new orders/rescales). CX (Intel shared, EU-only) rose ~1.3x; CPX/CCX rose 2.1x–3.1x, with US CPX hit hardest (CPX31 US ×2.98). This materially changes the "Hetzner is dirt cheap" assumption for US regions.

| Plan | Specs | Region | Monthly (EUR) | Monthly (USD) |
|---|---|---|---|---|
| CX33 | 4 vCPU / 8 GB (shared Intel) | Germany/Finland only | **€8.49** | **$9.99** |
| CX23 | 2 vCPU / 4 GB (shared Intel) | Germany/Finland only | ~€4.4 (**UNVERIFIED** exact) | ~$5.13 (getdeploying, may predate 15-Jun increase) |
| CX43 | 8 vCPU / 16 GB (shared Intel) | Germany/Finland only | €15.99 | $18.49 |
| CPX32 | 4 vCPU / 8 GB (shared AMD; specs **UNVERIFIED** — inferred from series naming) | Germany/Finland | €35.49 | $41.99 |
| CPX31 | 4 vCPU / 8 GB (shared AMD) | **USA (ASH/HIL)** | €62.49 | **$73.49** |

- CX series is **not offered in US locations**; cheapest 4 vCPU/8 GB shared in the US is now CPX31 at $73.49/mo.
- ~20 TB egress included per server (long-standing Hetzner policy — **UNVERIFIED** for post-June-2026 terms).
- Prices excl. VAT; excl. IPv4 add-on (~€0.50/mo, **UNVERIFIED** current rate).

Sources: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ (full old/new tables; verified 2026-07-14); https://northflank.com/blog/hetzner-cloud-server-price-increases (increase multiples; verified 2026-07-14); https://getdeploying.com/hetzner (CX23/33/43 specs; verified 2026-07-14).

---

## 3. Managed Postgres with pgvector

### Neon (serverless Postgres, pgvector supported)

Post-Databricks-acquisition repricing (2026): compute down 15–25%, storage down from $1.75 to $0.35/GB-month, paid plans now purely usage-based (no monthly floor). 1 CU = 1 vCPU + 4 GB RAM.

| Item | Launch plan | Scale plan |
|---|---|---|
| Base fee | $0 (usage-only) | $0 (usage-only) |
| Compute | **$0.106 / CU-hour** | **$0.222 / CU-hour** |
| Storage | **$0.35 / GB-month** | $0.35 / GB-month |
| Free tier | 100 CU-hours/project/month, 0.5 GB storage/project | — |
| Extra branches | ~$1.50/branch-month ($0.002/branch-hour) | same |
| PITR history | $0.20 / GB-month (≤7 days) | $0.20 / GB-month (≤30 days) |

Always-on 1 CU on Launch = 730 h × $0.106 ≈ **$77/mo** — Neon's economics assume autosuspend/scale-to-zero; an always-on primary is cheaper on RDS or self-hosted.

Source: https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/ (article dated 2026-06-23; verified 2026-07-14). **Note:** https://neon.com/pricing was unreachable from this network (connection refused) on 2026-07-14, so official-page confirmation is pending — treat Neon rates as secondary-source verified.

### AWS RDS db.t4g.medium (reference point)

| Item | Price | Notes |
|---|---|---|
| db.t4g.medium (2 vCPU Graviton2, 4 GB) on-demand, us-east-1, Single-AZ | **$0.065/hr ≈ $47.45/mo** (engine-agnostic figure; PostgreSQL-specific rate possibly $0.07–0.073/hr ≈ $51–53/mo — **UNVERIFIED** which applies) | instance only |
| gp3 storage | ~$0.115 / GB-month (**UNVERIFIED** — standard published rate, not re-confirmed) | add ~$2.30 for 20 GB |

pgvector is supported on RDS for PostgreSQL 15.2+ (long-standing; **UNVERIFIED** re-check for PG16 minor). Realistic monthly: **~$50–56 + storage ≈ $52–58/mo** Single-AZ; ×2 for Multi-AZ.

Sources: https://instances.vantage.sh/aws/rds/db.t4g.medium ($0.065/hr, 2 vCPU/4 GB; verified 2026-07-14); https://aiven.io/tools/instances/db.t4g.medium ($47.45/mo; verified 2026-07-14); https://aws.amazon.com/rds/postgresql/pricing/ (fetched 2026-07-14 but pricing tables are JS-rendered and returned no figures).

---

## 4. Managed Redis

### Upstash (pay-as-you-go)

| Item | Price |
|---|---|
| Commands | **$0.20 per 100K commands** (first 500K/month free) |
| Storage | **$0.25 / GB** (first 1 GB free) |
| Bandwidth | first 200 GB/month free, then $0.03/GB |
| Free tier | 256 MB, 500K commands/month |
| Prod Pack (SLA, multi-zone HA, SOC-2) | +$200/month per database |

### Upstash fixed plans (flat monthly, no per-command charge)

| Size | Price | Included bandwidth |
|---|---|---|
| 250 MB | **$10/mo** | 50 GB |
| 1 GB | **$20/mo** | 100 GB |
| 5 GB | $100/mo | 500 GB |
| 100 GB | $800/mo | 10 TB |

Self-hosted alternative: Redis 7 container on Railway at compute rates (e.g. 0.25 vCPU + 256 MB ≈ **$7.50/mo**) or free inside a Hetzner VPS.

Sources: https://www.srvrlss.io/provider/upstash/ (verified 2026-07-14); corroborated by https://upstash.com/docs/redis/overall/pricing and https://upstash.com/blog/redis-new-pricing via search excerpts (2026-07-14). **Note:** upstash.com was unreachable directly from this network (connection refused) on 2026-07-14 — rates match across two independent excerpts but official-page confirmation is pending.

---

## 5. Starter vs growth stack — Railway vs Hetzner

Model assumptions (provisioned-equivalent, 730 h/month, worst case — Railway bills actual usage, so real Railway bills run lower at low utilization):

- **Starter:** API 1 vCPU/1 GB; worker 1 vCPU/1 GB; Postgres 1 vCPU/1 GB + 10 GB volume; Redis 0.25 vCPU/0.25 GB; 50 GB egress. Static frontend ≈ $0 (Railway static/Cloudflare Pages/Netlify free tier).
- **Growth (≈2×):** API 2 vCPU/2 GB; worker 2 vCPU/2 GB; Postgres 2 vCPU/4 GB + 50 GB volume; Redis 0.5 vCPU/1 GB; 200 GB egress.

| Line item | Railway starter | Railway growth | Hetzner (EU) starter | Hetzner (EU) growth |
|---|---|---|---|---|
| API | $30 (1 vCPU $20 + 1 GB $10) | $60 | — (shared box) | — (shared box) |
| Worker | $30 | $60 | — | — |
| Postgres | $30 + $1.50 volume | $80 + $7.50 volume | — | — (own box) |
| Redis | $7.50 | $20 | — | — |
| Servers | — | — | 1× CX33 (4/8) $9.99 | 1× CX43 (8/16) app $18.49 + 1× CX33 DB $9.99 |
| Egress | $2.50 (50 GB) | $10 (200 GB) | $0 (within 20 TB incl.) | $0 |
| Plan/base | Pro $20 seat (offset by $20 incl. usage) | same | — | — |
| **Total/mo** | **≈ $101** | **≈ $237** | **≈ $10** | **≈ $28** |

- **Hetzner US instead of EU:** starter 1× CPX31 = **$73.49/mo**; growth 2× CPX31 = **$147/mo** — the post-June-2026 US pricing erases most of Hetzner's US advantage vs Railway at starter scale.
- Hetzner figures exclude ops labor, backups (Hetzner backups +20% of server price — **UNVERIFIED** current rate), and managed-DB conveniences (PITR, failover).
- Hybrid worth pricing: Hetzner EU compute + Neon (autosuspending) + Upstash PAYG ≈ $10–25/mo starter with managed data stores.

---

## Implications

- **Worker $/CPU-second on Railway:** $20/vCPU-month ÷ 2,628,000 s ≈ **$7.6e-6 per vCPU-second** (plus $3.8e-6/GB-s RAM). A flow-run burning 500 ms of one vCPU costs ≈ **$0.0000038** in compute — 1M such runs/month ≈ **$3.80 + RAM ≈ $5–6**. Compute is a rounding error vs LLM token cost; don't over-optimize it.
- **Railway is ~10× Hetzner EU** at these sizes ($101 vs $10 starter), but only ~1.4× Hetzner **US** post-increase ($101 vs $73). If EU latency is acceptable for workers (they're async), moving the CPU-bound worker fleet to Hetzner EU is the single biggest lever; keep API/DB on Railway.
- **Postgres:** Railway 1 vCPU/1 GB PG ≈ $31.50 vs RDS db.t4g.medium ≈ $52–58 vs Neon always-on 1 CU ≈ $77. Railway is the cheapest *always-on* managed-ish option; Neon only wins if the DB can autosuspend (dev/preview branches — where its $0 floor and branching shine).
- **Redis:** Upstash PAYG breaks even with its $10 fixed plan at ~5M commands/month ($0.20/100K). A busy queue (BullMQ-style polling) easily exceeds that — for a worker queue prefer a fixed plan or a $7.50 Railway container; PAYG per-command pricing punishes polling workloads.
- **Egress asymmetry:** Railway $0.05/GB vs Hetzner ~free (20 TB incl.) vs Upstash $0.03/GB after 200 GB. If flows ever ship large files/exports, egress becomes a Railway line item ($50/TB) before compute does — route bulk downloads through object storage or Hetzner.
