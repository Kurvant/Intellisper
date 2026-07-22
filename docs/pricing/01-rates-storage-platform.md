# Rate card — storage, egress, platform services (Phase 1)

Recorded: 2026-07-14

All prices USD, public list prices, verified against the sources cited on the date shown. Anything not confirmed from a primary source is marked **UNVERIFIED**.

---

## 1. AWS S3 Standard (us-east-1)

| Item | Price |
|---|---|
| Storage — first 50 TB/month | $0.023 / GB-month |
| Storage — next 450 TB/month | $0.022 / GB-month |
| Storage — over 500 TB/month | $0.021 / GB-month |
| PUT / COPY / POST / LIST requests | $0.005 per 1,000 |
| GET / SELECT requests | $0.0004 per 1,000 |
| Data transfer OUT to internet — free allowance | First 100 GB/month free (aggregated across all AWS services/regions) |
| Data transfer OUT — first 10 TB/month | $0.09 / GB |
| Data transfer OUT — next 40 TB/month | $0.085 / GB |
| Data transfer OUT — next 100 TB/month | $0.07 / GB |
| Data transfer OUT — over 150 TB/month | $0.05 / GB |
| Data transfer IN | Free |

- Source (primary): https://aws.amazon.com/s3/pricing/ — page confirmed the 100 GB/month free egress allowance directly; the numeric tables on this page are rendered client-side and could not be scraped, so tier numbers were cross-checked against secondary trackers.
- Cross-check sources: https://cloudchipr.com/blog/amazon-s3-pricing-explained , https://filebase.com/blog/aws-s3-pricing-in-2026-what-youll-actually-pay/ , https://infratally.com/articles/aws-s3-pricing-explained-2026/ (all quote identical us-east-1 numbers).
- Verified: 2026-07-14. Note: storage/request tier numbers are corroborated by multiple independent 2026 sources but not read directly off the AWS table — treat as high-confidence, re-check in AWS calculator before contract pricing.

## 2. Cloudflare R2

| Item | Standard | Infrequent Access |
|---|---|---|
| Storage | $0.015 / GB-month | $0.01 / GB-month |
| Class A operations (writes/lists) | $4.50 / million | $9.00 / million |
| Class B operations (reads) | $0.36 / million | $0.90 / million |
| Egress to internet | **$0 — confirmed free** | $0 (data retrieval fee applies for IA: check before using IA) |

Free tier (per account, monthly): 10 GB-month storage, 1 million Class A ops, 10 million Class B ops.

- Source (primary): https://developers.cloudflare.com/r2/pricing/
- Verified: 2026-07-14. Page states egress is free for access via Workers API, S3 API, and r2.dev domains.

## 3. Cloudflare for SaaS (custom hostnames)

| Item | Price |
|---|---|
| Included custom hostnames (Free, Pro, Business plans) | First 100 free |
| Each additional custom hostname | $0.10 / hostname / month |
| Hard cap before "contact sales" | 50,000 hostnames |

- Source (primary): https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
- Verified: 2026-07-14. Confirmed: the 100-free + $0.10/mo structure applies on Free, Pro, and Business plans alike; Enterprise is custom (add-on, contact sales).

## 4. GitHub Packages (private packages)

Included quotas (private packages only — **public packages are entirely free**, and all inbound transfer is free):

| Plan | Included storage | Included data transfer / month |
|---|---|---|
| Free (incl. free orgs) | 500 MB | 1 GB |
| Pro | 2 GB | 10 GB |
| Team | 2 GB | 10 GB |
| Enterprise Cloud | 50 GB | 100 GB |

Overage prices:

| Item | Price |
|---|---|
| Storage overage | $0.25 / GB-month (metered hourly; ≈ $0.008 / GB / day) |
| Data transfer overage | $0.50 / GB |

Real-world limits for **private npm packages under a free org**:

- 500 MB total storage and 1 GB/month egress, shared with Actions artifacts storage.
- Downloads triggered from within GitHub Actions workflows do **not** count against data transfer ("Bandwidth for packages within Actions workflows is free" — GitHub pricing calculator). Installs from developer laptops or external CI **do** count.
- With **no payment method on file, usage is hard-blocked once the quota is used up** (installs start failing) — it does not silently bill.
- Storage is metered per hour (docs example: 6,768 GB-hours / 744 h = 9.0967 GB billed for the month), so short-lived versions cost proportionally less.
- Separate carve-out: "Container image storage and bandwidth for the Container registry (ghcr.io) is currently free" per GitHub docs — this applies to container images only, not npm; GitHub reserves the right to start billing with notice.

- Sources (primary): https://docs.github.com/en/billing/concepts/product-billing/github-packages (quotas, hourly metering, blocking behavior, GHCR free note; verified 2026-07-14); https://github.com/pricing/calculator?feature=packages (overage rates $0.25/GB storage, $0.50/GB transfer, Actions-bandwidth-free note; verified 2026-07-14).
- Cross-check: Microsoft Q&A moderator quotes $0.008/GB/day for Packages storage (https://learn.microsoft.com/en-us/answers/questions/2247817/pricing-of-overage-storage-in-github-enterprise, 2025-04-15), consistent with $0.25/GB-month.
- Caveat: current GitHub docs pages no longer print the dollar rates inline (they defer to the calculator). One search snippet claimed newer rates of $0.07/GiB storage and $0.0875/GiB transfer — this could **not** be confirmed on any GitHub property and contradicts the calculator: **UNVERIFIED, disregard unless the calculator changes.**

## 5. Log storage reference — Grafana Cloud (Loki)

Free tier: 50 GB logs ingested/month (30-day retention). Paid (Pro): $0.05/GB ingested beyond that, plus $19/month platform fee. Source: https://grafana.com/pricing/ — verified 2026-07-14.

---

## Implications for the cost model

- **Flow-run logs are a rounding error at storage level.** A workspace doing 10k runs/month at ~50 KB/run generates ~0.5 GB/month; with 30-day retention that is ~0.5 GB steady state ≈ $0.0075/mo on R2 (or $0 inside the 10 GB free tier) vs ~$0.0115/mo on S3. The real cost is write operations: 10k PUTs ≈ $0.045 (R2 Class A) / $0.05 (S3) — so batch/append log writes rather than one object per run at higher volumes.
- **R2 beats S3 decisively for user-facing file serving because of egress.** Serving 1 TB/month of user uploads costs ~$81–90 in S3 egress (after the 100 GB free allowance) vs $0 on R2; R2's storage is also 35% cheaper ($0.015 vs $0.023/GB-month). S3 only wins on GET-heavy workloads that never leave AWS.
- **Per-tenant custom domains cost effectively nothing until scale:** first 100 tenant hostnames free, then $0.10/mo each — 1,000 white-label tenant domains ≈ $90/month, easily absorbed as ~$0.10/tenant in plan pricing.
- **GitHub Packages free-org is not a viable private npm registry for real distribution:** 1 GB/month transfer means a 5 MB package exhausts the quota at ~200 installs/month (outside Actions), then installs hard-fail if no card is on file; even Team is only 10 GB/month, and overage transfer at $0.50/GB is ~5x S3 egress. Fine for internal low-volume packages consumed mainly by Actions; wrong tool for customer-facing distribution.
- **Self-hosted log analytics has a cheap managed fallback:** the entire 10k-runs/month workspace log volume (~0.5 GB/mo) fits ~100x over in Grafana Cloud's 50 GB free tier, and marginal ingest at $0.05/GB is comparable to raw R2+ops cost once query infrastructure is factored in.
