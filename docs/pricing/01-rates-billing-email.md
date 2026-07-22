# Rate card — payments and email (Phase 1)

Recorded: 2026-07-14

All figures are US public list prices, verified against the vendor's own pricing page on 2026-07-14 unless marked otherwise. Anything not confirmed on a primary source is marked **UNVERIFIED**.

---

## 1. Stripe — card processing and Billing

| Item | Rate | Notes |
|---|---|---|
| Standard US card processing | **2.9% + $0.30** per successful charge | Domestic cards, online |
| International card surcharge | **+1.5%** | Added on top of standard rate |
| Currency conversion surcharge | **+1.0%** | When conversion is required |
| Stripe Billing (subscriptions), pay-as-you-go | **0.7% of Billing volume** | Single plan since Starter/Scale (0.5%/0.8%) merged in 2024; excludes one-off invoices |
| Stripe Billing, committed monthly plans | From **$620/mo** (1-yr contract), **0.67%** on volume above included threshold | Only worth it at scale |
| Usage-based / metered billing | **No separate fee** — included in Billing pricing | Meters API included with up to 100M events/month |
| Disputes | **$15** each | UNVERIFIED on primary page (widely reported secondary figure) |

- Source: [stripe.com/pricing](https://stripe.com/pricing) and [stripe.com/billing/pricing](https://stripe.com/billing/pricing) — verified 2026-07-14.

## 2. Merchant-of-record alternatives (comparison only)

| Provider | All-in fee | Notes |
|---|---|---|
| Paddle | **5% + $0.50** per checkout transaction | All-in MoR: includes tax remittance, fraud, no international/subscription surcharges. Source: [paddle.com/pricing](https://www.paddle.com/pricing) — verified 2026-07-14 |
| Lemon Squeezy | **5% + $0.50** per transaction, plus add-on surcharges (international cards, PayPal, subscriptions) | **UNVERIFIED on primary** — lemonsqueezy.com returned 403; figure corroborated by multiple 2026 comparisons (e.g. [dev.to fee comparison](https://dev.to/jettfu/stripe-vs-paddle-vs-lemon-squeezy-fee-comparison-2026-2c77), [solodevstack.com](https://solodevstack.com/blog/paddle-vs-lemonsqueezy-solo-developers)) — checked 2026-07-14 |

## 3. Transactional email

| Provider | Free tier | Paid price | Effective cost at 10k emails/mo |
|---|---|---|---|
| Amazon SES | 3,000 msgs/mo for first 12 months (new customers) | **$0.10 per 1,000 emails** (+$0.12/GB attachment data) | **~$1.00/mo** |
| Resend | 3,000 emails/mo, capped at **100/day** | Pro **$20/mo** for 50,000 emails | **$20/mo** (free tier's 100/day cap ≈ 3k/mo max, can't cover 10k) |
| Postmark | 100 emails/mo | Basic **$15/mo** for 10,000 emails (overage $1.80/1k); Pro $16.50, Platform $18 | **$15/mo** |

- Sources: [aws.amazon.com/ses/pricing](https://aws.amazon.com/ses/pricing/), [resend.com/pricing](https://resend.com/pricing), [postmarkapp.com/pricing](https://postmarkapp.com/pricing) — all verified 2026-07-14.
- **Cheapest at 10k/mo: Amazon SES at ~$1/mo — 15x cheaper than Postmark, 20x cheaper than Resend.** Trade-off: SES needs your own deliverability setup (domain auth, bounce/complaint handling); Postmark/Resend bundle that DX.

## 4. Chrome Web Store

| Item | Cost | Notes |
|---|---|---|
| Developer registration | **$5.00 one-time** | Per developer account, lifetime; covers up to 20 extensions. "One-time registration fee" confirmed on [developer.chrome.com/docs/webstore/register](https://developer.chrome.com/docs/webstore/register) (verified 2026-07-14); the $5 amount shown at payment step — corroborated by [Google support threads](https://support.google.com/chrome/thread/166445238) and 2026 secondary sources |
| Per-extension publishing fee | **$0** | None |
| Update / re-publish fee | **$0** | None |

---

## Implications for the cost model

- **Effective Stripe take on a $25/mo subscription (US card): $1.20 = 4.8%** — $0.725 (2.9%) + $0.30 fixed + $0.175 (0.7% Billing). The fixed $0.30 is what hurts at low price points; on a $10/mo plan the take rises to ~6.6%.
- **International customer on the same $25 plan: ~$1.83–$2.08 = 7.3–8.3%** (+1.5% intl card, +1% FX) — nearly identical to Paddle's flat 5% + $0.50 ($1.75 = 7.0%), so if a large share of customers is non-US, an MoR that also handles VAT/sales tax becomes cost-competitive, not just compliance-convenient.
- **Metered/usage-based billing adds zero incremental Stripe fee** — the Meters API is included in the 0.7% Billing rate, so action-cap style metering (the current entitlement model) costs nothing extra on the billing side.
- **Email is a rounding error on SES: ~$1.00 per 1,000 active users/month** assuming ~10 transactional emails (invites, alerts, OTPs) per user/month = 10k emails. The same volume costs $15/mo on Postmark and $20/mo on Resend — still trivial in absolute terms, so DX/deliverability can legitimately outweigh price until volume is well past 100k/mo.
- **Chrome extension distribution is effectively free**: $5 once, no recurring or per-update fees — negligible in the model.
