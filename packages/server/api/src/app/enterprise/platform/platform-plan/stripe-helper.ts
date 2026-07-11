// Clean-room implementation — payment-processor integration (capability spec G.3).
//
// The entire integration is inert unless the deployment is the managed cloud: outside
// CLOUD, the processor client resolves to "not configured" and callers must treat every
// billing operation as a safe no-op. Money movement is driven by verified processor
// webhooks (see stripe-billing.controller); this helper only initiates hosted flows and
// mutates subscriptions. Upgrades apply immediately (prorated); downgrades are deferred
// to period end via a single subscription schedule.
import { ibDayjs } from '@intelblocks/server-utils'
import { IbEdition, assertNotNullOrUndefined, isNil, PRICE_ID_MAP, PRICE_NAMES, UserWithMetaInformation } from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import Stripe from 'stripe'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { platformPlanService } from './platform-plan.service'

// Metadata tag distinguishing the kind of a one-off (non-subscription) payment so the
// webhook can route the confirmation to the right credit-grant path.
export enum StripeCheckoutType {
    CREDIT_PURCHASE = 'credit-purchase',
    CREDIT_AUTO_TOP_UP = 'credit-auto-top-up',
}

const frontendUrl = system.get(AppSystemProp.FRONTEND_URL)

function extraActiveFlowsPriceId(): string {
    const secret = system.get(AppSystemProp.STRIPE_SECRET_KEY)
    const env = secret?.startsWith('sk_test') ? 'dev' : 'prod'
    return PRICE_ID_MAP[PRICE_NAMES.ACTIVE_FLOWS][env]
}

export const stripeHelper = (log: FastifyBaseLogger) => ({

    // The processor client, or undefined when billing is inert (non-cloud). Callers MUST
    // treat undefined as "billing not available" and no-op rather than error.
    getStripe(): Stripe | undefined {
        if (system.getEdition() !== IbEdition.CLOUD) {
            return undefined
        }
        const secret = system.getOrThrow(AppSystemProp.STRIPE_SECRET_KEY)
        return new Stripe(secret, { apiVersion: '2025-05-28.basil' })
    },

    // Create a billing-customer record correlated to the organization. Skipped outside
    // cloud and in non-production environments (returns undefined).
    async createCustomer(user: UserWithMetaInformation, platformId: string): Promise<string | undefined> {
        const stripe = this.getStripe()
        if (isNil(stripe)) {
            return undefined
        }
        const customer = await stripe.customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            description: `Organization ${platformId}`,
            metadata: { platformId },
        })
        return customer.id
    },

    // Hosted portal where the customer manages payment methods, invoices, cancellation.
    async createPortalSession(platformId: string): Promise<string> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        const plan = await platformPlanService(log).getOrCreateForPlatform(platformId)
        assertNotNullOrUndefined(plan.stripeCustomerId, 'billing customer is not set')
        const session = await stripe.billingPortal.sessions.create({
            customer: plan.stripeCustomerId,
            return_url: `${frontendUrl}/platform/billing`,
        })
        return session.url
    },

    // Start a subscription checkout, optionally including a quantity of extra
    // concurrently-enabled automations beyond the tier's included limit.
    async createSubscriptionCheckout({ platformId, customerId, extraActiveFlows }: SubscriptionCheckoutParams): Promise<string> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
        if (!isNil(extraActiveFlows) && extraActiveFlows > 0) {
            lineItems.push({ price: extraActiveFlowsPriceId(), quantity: extraActiveFlows })
        }
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            line_items: lineItems,
            allow_promotion_codes: true,
            subscription_data: { metadata: { platformId } },
            success_url: `${frontendUrl}/platform/billing?status=success`,
            cancel_url: `${frontendUrl}/platform/billing?status=cancel`,
        })
        return session.url!
    },

    // Apply a subscription change. Upgrades take effect immediately with proration;
    // downgrades (including to the free tier) are deferred to period end through a single
    // subscription schedule, releasing any prior schedule so at most one is active.
    async changeSubscription({ subscriptionId, extraActiveFlows, isUpgrade, isFreeDowngrade }: ChangeSubscriptionParams): Promise<string> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        const successUrl = `/platform/billing?status=${isUpgrade ? 'upgraded' : 'downgraded'}`

        const { data: _result, error } = await tryChangeSubscription(stripe, { subscriptionId, extraActiveFlows, isUpgrade, isFreeDowngrade })
        if (error) {
            log.error({ err: error, subscriptionId }, 'subscription change failed')
            return '/platform/billing?status=error'
        }
        return successUrl
    },

    // The subscription's actual current billing period (falls back to the calendar month
    // when no relevant item is present).
    async getSubscriptionPeriod(subscription: Stripe.Subscription): Promise<{ startDate: number, endDate: number, cancelDate?: number }> {
        const item = subscription.items.data.find((it) => it.price.id === extraActiveFlowsPriceId()) ?? subscription.items.data[0]
        if (isNil(item)) {
            return { startDate: ibDayjs().startOf('month').unix(), endDate: ibDayjs().endOf('month').unix(), cancelDate: undefined }
        }
        return {
            startDate: item.current_period_start,
            endDate: item.current_period_end,
            cancelDate: subscription.cancel_at ?? undefined,
        }
    },

    // ---- Prepaid credits (spec G.3.5) ----

    async createCreditPurchaseSession({ platformId, customerId, amountInCurrency }: CreditPurchaseParams): Promise<string> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer: customerId,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'AI Credits' },
                    unit_amount: Math.round(amountInCurrency * 100),
                },
                quantity: 1,
            }],
            allow_promotion_codes: true,
            metadata: { platformId, type: StripeCheckoutType.CREDIT_PURCHASE },
            invoice_creation: { enabled: true, invoice_data: { metadata: { platformId, type: StripeCheckoutType.CREDIT_PURCHASE } } },
            success_url: `${frontendUrl}/platform/billing?status=credits-added`,
            cancel_url: `${frontendUrl}/platform/billing?status=cancel`,
        })
        return session.url!
    },

    async createAutoTopUpSetupSession({ platformId, customerId }: { platformId: string, customerId: string }): Promise<string> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        const session = await stripe.checkout.sessions.create({
            mode: 'setup',
            customer: customerId,
            payment_method_types: ['card'],
            metadata: { platformId, type: StripeCheckoutType.CREDIT_AUTO_TOP_UP },
            success_url: `${frontendUrl}/platform/billing?status=auto-topup-enabled`,
            cancel_url: `${frontendUrl}/platform/billing?status=cancel`,
        })
        return session.url!
    },

    async chargeAutoTopUp({ platformId, customerId, amountInCurrency, paymentMethod }: ChargeAutoTopUpParams): Promise<void> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        const invoice = await stripe.invoices.create({
            customer: customerId,
            collection_method: 'charge_automatically',
            auto_advance: true,
            description: 'AI Credits auto top-up',
            metadata: { platformId, type: StripeCheckoutType.CREDIT_AUTO_TOP_UP },
        })
        assertNotNullOrUndefined(invoice.id, 'invoice id is undefined')
        await stripe.invoiceItems.create({
            customer: customerId,
            invoice: invoice.id,
            amount: Math.round(amountInCurrency * 100),
            currency: 'usd',
            description: 'AI Credits auto top-up',
            metadata: { platformId, type: StripeCheckoutType.CREDIT_AUTO_TOP_UP },
        })
        const finalized = await stripe.invoices.finalizeInvoice(invoice.id)
        await stripe.invoices.pay(finalized.id!, { off_session: true, payment_method: paymentMethod })
    },

    async getAutoTopUpTotalThisMonth(customerId: string, platformId: string): Promise<number> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        const startOfMonth = ibDayjs().startOf('month').unix()
        let totalCents = 0
        const invoices = stripe.invoices.list({
            customer: customerId,
            created: { gte: startOfMonth },
            status: 'paid',
            collection_method: 'charge_automatically',
            limit: 100,
        })
        for await (const invoice of invoices) {
            if (invoice.metadata?.platformId === platformId && invoice.metadata?.type === StripeCheckoutType.CREDIT_AUTO_TOP_UP) {
                totalCents += invoice.amount_paid ?? 0
            }
        }
        return totalCents / 100
    },

    // ---- Payment methods ----

    async getPaymentMethod(customerId: string): Promise<string | null> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        const methods = await stripe.paymentMethods.list({ customer: customerId })
        return methods.data[0]?.id ?? null
    },

    async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<void> {
        const stripe = this.getStripe()
        assertNotNullOrUndefined(stripe, 'billing is not configured')
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
    },

    async getNextBillingAmount(subscriptionId?: string | null): Promise<number> {
        const stripe = this.getStripe()
        if (isNil(stripe) || isNil(subscriptionId)) {
            return 0
        }
        try {
            const preview = await stripe.invoices.createPreview({ subscription: subscriptionId })
            return (preview.amount_due ?? 0) / 100
        }
        catch {
            return 0
        }
    },

    // Reached during self-serve organization deletion: settle open invoices then remove
    // the billing customer. Inert (no-op) when billing is not configured.
    async deleteCustomer(subscriptionId: string): Promise<void> {
        const stripe = this.getStripe()
        if (isNil(stripe)) {
            return
        }
        const invoices = await stripe.invoices.list({ subscription: subscriptionId })
        for (const invoice of invoices.data) {
            if (invoice.id) {
                await stripe.invoices.pay(invoice.id)
            }
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
        await stripe.customers.del(customer)
    },
})

// Immediate upgrade vs deferred downgrade, realized through the processor's scheduling
// facility with at most one active schedule.
async function tryChangeSubscription(stripe: Stripe, params: ChangeSubscriptionParams): Promise<{ data: true, error: undefined } | { data: undefined, error: unknown }> {
    try {
        const subscription = await stripe.subscriptions.retrieve(params.subscriptionId, { expand: ['items.data.price'] })
        const schedules = await stripe.subscriptionSchedules.list({ customer: subscription.customer as string, limit: 10 })
        const active = schedules.data.filter((s) => s.subscription === subscription.id || s.status === 'active' || s.status === 'not_started')

        if (params.isUpgrade) {
            // Release any pending deferred change and apply now with proration.
            for (const schedule of active) {
                await stripe.subscriptionSchedules.release(schedule.id)
            }
            await applyImmediateChange(stripe, subscription, params.extraActiveFlows)
            return { data: true, error: undefined }
        }

        // Downgrade: schedule for period end; keep exactly one active schedule.
        const schedule = active[0] ?? await stripe.subscriptionSchedules.create({ from_subscription: subscription.id })
        for (let i = 1; i < active.length; i++) {
            await stripe.subscriptionSchedules.release(active[i].id)
        }
        await applyDeferredChange(stripe, schedule.id, subscription, params.extraActiveFlows, params.isFreeDowngrade)
        return { data: true, error: undefined }
    }
    catch (error) {
        return { data: undefined, error }
    }
}

async function applyImmediateChange(stripe: Stripe, subscription: Stripe.Subscription, extraActiveFlows: number): Promise<void> {
    const priceId = extraActiveFlowsPriceId()
    const items: Stripe.SubscriptionUpdateParams.Item[] = []
    const current = subscription.items.data.find((it) => it.price.id === priceId)
    if (current?.id) {
        items.push({ id: current.id, deleted: true })
    }
    if (extraActiveFlows > 0) {
        items.push({ price: priceId, quantity: extraActiveFlows })
    }
    await stripe.subscriptions.update(subscription.id, { items, proration_behavior: 'always_invoice' })
}

async function applyDeferredChange(stripe: Stripe, scheduleId: string, subscription: Stripe.Subscription, extraActiveFlows: number, isFreeDowngrade: boolean): Promise<void> {
    const priceId = extraActiveFlowsPriceId()
    const anchorItem = subscription.items.data.find((it) => it.price.id === priceId) ?? subscription.items.data[0]
    const periodStart = anchorItem?.current_period_start ?? ibDayjs().startOf('month').unix()
    const periodEnd = anchorItem?.current_period_end ?? ibDayjs().endOf('month').unix()

    const currentPhaseItems: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] = subscription.items.data.map((it) => ({
        price: it.price.id,
        quantity: it.quantity ?? undefined,
    }))
    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
        { items: currentPhaseItems, start_date: periodStart, end_date: periodEnd },
    ]
    if (!isFreeDowngrade) {
        const nextItems: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] = []
        if (extraActiveFlows > 0) {
            nextItems.push({ price: priceId, quantity: extraActiveFlows })
        }
        phases.push({ items: nextItems, start_date: periodEnd })
    }
    await stripe.subscriptionSchedules.update(scheduleId, {
        phases,
        end_behavior: isFreeDowngrade ? 'cancel' : 'release',
    })
}

type SubscriptionCheckoutParams = { platformId: string, customerId: string, extraActiveFlows?: number }
type ChangeSubscriptionParams = { subscriptionId: string, extraActiveFlows: number, isUpgrade: boolean, isFreeDowngrade: boolean }
type CreditPurchaseParams = { platformId: string, customerId: string, amountInCurrency: number }
type ChargeAutoTopUpParams = { platformId: string, customerId: string, amountInCurrency: number, paymentMethod: string }
