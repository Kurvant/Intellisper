# Intellisper — Feature → Cost-Driver Inventory (Phase 0)

> Grounded in the blockunits codebase (verified 2026-07-13). This is the input to the
> per-feature unit-economics model in `02-unit-economics.md` and the rate card in
> `01-rates-*.md`. Deployment target: **cloud edition (`IB_EDITION=cloud`)**.

## Baseline infrastructure (fixed monthly, independent of usage)

| Component | Evidence in code | Cost driver |
|---|---|---|
| Postgres (with pgvector) | `docker-compose` uses `pgvector/pgvector:pg16`; knowledge-base schema uses `vector(768)` | Managed PG instance (CPU/RAM/storage) |
| Redis 7 | queues (worker RPC, system jobs), distributedStore, socket.io adapter | Managed Redis instance |
| App compute | 3 processes: api, worker, web (Next-less React SPA served statically + Fastify API) | 2–3 containers/VMs |
| S3-compatible object storage | `IB_S3_*` props (bucket, endpoint, region, keys, signed URLs) | GB-month + requests + egress |
| SMTP | `IB_SMTP_*`; invites, alerts, OTP emails; default sender still `noreply@activepieces.com` (flagged) | per-email |
| Observability (optional) | `IB_LOKI_*`, OTEL props | log GB ingested |
| Block registry | GitHub Packages (`@intelblocks`, 745 pkgs, ~<500 MB) | storage + bandwidth overage |

## Per-feature marginal cost drivers

| # | Feature | Marginal cost drivers | Notes from code |
|---|---|---|---|
| 1 | Flow runs (core automation) | worker CPU-seconds per run; Redis ops; PG writes; run-log storage (retention `IB_EXECUTION_DATA_RETENTION_DAYS`=30, size cap `IB_MAX_FLOW_RUN_LOG_SIZE_MB`) | Billing lever exists upstream: `PRICE_PER_EXTRA_ACTIVE_FLOWS = 5` ($/mo per extra active flow) |
| 2 | Webhooks | ingress bandwidth, payload storage (caps via props), one run trigger | |
| 3 | AI credits (flow AI steps) | **OpenRouter managed keys we provision and pay** — `enterprise/platform/platform-plan/openrouter/openrouter-api.ts` creates keys at `https://openrouter.ai/api/v1/keys` with USD limits; credits map to USD | This is direct, metered COGS |
| 4 | Browser agent (Intellisper) | LLM tokens on OUR provider keys: default `claude-haiku-4-5`, escalation `claude-sonnet-4-6`, reasoning `claude-opus-4-6`, fallback `gpt-4o`, distill `claude-haiku-4-5`; embeddings `text-embedding-3-small`; WebSocket/API orchestration compute; pgvector memory storage | **Execution is CLIENT-SIDE in the user's Chrome extension — "NEVER headless" — so server browser-runtime cost ≈ $0.** `browserless` block is BYO-key (user's cost). |
| 5 | Chat (enterprise/chat) | per-message LLM tokens (tier `modelId` per chat config), PG storage | |
| 6 | Knowledge base | document parse CPU (unpdf/mammoth), embedding tokens, pgvector rows (`vector(768)`) | |
| 7 | Tables | PG storage + API compute (`IB_MAX_RECORDS_PER_TABLE` etc.) | |
| 8 | Files / attachments | S3 or PG storage (`IB_MAX_FILE_SIZE_MB`), 30-day retention for run files | |
| 9 | MCP servers | compute per tool call (thin), PG config storage | |
| 10 | Todos / approvals | negligible (PG rows, emails) | |
| 11 | Human input / forms | negligible (PG + one run) | |
| 12 | Enterprise: SSO/SAML, RBAC/project roles, audit logs, analytics, environments+git sync, embedding SDK, secret managers, global connections, SCIM | mostly PG storage + query compute; audit-log volume is the only one that scales with usage | License-gated features, near-zero marginal cost — priced on value, not cost |
| 13 | Custom domains | Cloudflare for SaaS custom hostnames (`IB_CLOUDFLARE_*` props) | per-hostname fee |
| 14 | Platform overhead | Stripe fees on all revenue; email sends; GitHub Packages egress on worker cold-start block installs (cached on disk after first install) | |

## Key structural facts for the model

- **No seat-based billing upstream**: STANDARD cloud plan = 1 project, 10 active flows, 200 included AI credits; growth is usage-based ($5/extra active flow, AI-credit top-ups). We can diverge, but this is the reference shape.
- **Browser agent is CLOUD+ENTERPRISE gated** (`platform.plan.browserAgentEnabled`), so its LLM COGS only applies to paid tiers.
- Worker executes flows **unsandboxed** in-process (CE-style execution mode) → flow-run cost is pure CPU-seconds + memory on our worker fleet; no per-run VM/container spin-up.
- Block code is cached on the worker after first `bun install` from GitHub Packages → registry egress is amortized, not per-run.
