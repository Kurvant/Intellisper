# Intellisper pricing & cost model — working directory

Built in small, independently-completable units. Each file stands alone; the final
interactive model is assembled only from these files.

| Unit | File | Status |
|---|---|---|
| Phase 0 — feature → cost-driver inventory (from code) | `00-feature-cost-drivers.md` | ✅ done |
| Phase 1a — Anthropic token rates (browser-agent tiers) | `01-rates-ai-anthropic.md` | ✅ done |
| Phase 1b — OpenAI / OpenRouter / Gemini / Mistral / Bedrock rates | `01-rates-ai-others.md` | ✅ done |
| Phase 1c — compute / Postgres+pgvector / Redis hosting rates | `01-rates-infra.md` | ✅ done |
| Phase 1d — S3/R2, egress, Cloudflare SaaS, GitHub Packages, Loki | `01-rates-storage-platform.md` | ✅ done |
| Phase 1e — Stripe fees, transactional email, Chrome Web Store | `01-rates-billing-email.md` | ✅ done |
| Phase 2 — per-feature unit economics + representative workloads | `02-unit-economics.md` | ✅ done |
| Phase 3 — interactive financial model (source in repo, published as Artifact) | `financial-model.html` | ✅ done |

The interactive model is published at:
https://claude.ai/code/artifact/d54fec8d-a9da-41ba-87ae-67fe30e7de32
(private by default; the HTML source is committed here and can be opened locally too).

Rules for every rate: source URL + verification date required; anything unverified is
marked `UNVERIFIED`. All rates are public list prices as of the recorded date.
