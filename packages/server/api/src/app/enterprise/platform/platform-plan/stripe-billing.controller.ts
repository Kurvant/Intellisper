// Clean-room implementation — payment-processor webhook reconciler (capability spec
// G.3.4). This endpoint is the source of truth for commercial plan state: it verifies
// the processor's signature over the raw body, then reconciles the organization's plan
// record from the event. It is safely repeatable (processors retry). When billing is
// inert (non-cloud) it acknowledges without acting.
import {
    AGENT_FREE_PLAN,
    COMPLETE_FREE_PLAN,
    IbSubscriptionStatus,
    isNil,
    planLimitsForName,
    type PlatformPlanWithOnlyLimits,
    STUDIO_FREE_PLAN,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import Stripe from 'stripe'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { exceptionHandler } from '../../../helper/exception-handler'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { planPrice } from './plan-price'
import { platformAiCreditsService } from './platform-ai-credits.service'
import { platformPlanService } from './platform-plan.service'
import { StripeCheckoutType, stripeHelper } from './stripe-helper'

export const stripeBillingController: FastifyPluginAsyncZod = async (app) => {
    app.post('/stripe/webhook', {
        config: { security: securityAccess.public(), rawBody: true },
    }, async (request, reply) => {
        const stripe = stripeHelper(request.log).getStripe()
        if (isNil(stripe)) {
            // Billing inert — acknowledge so the processor stops retrying.
            return reply.status(StatusCodes.OK).send({ received: true })
        }

        let event: Stripe.Event
        try {
            const signature = request.headers['stripe-signature'] as string
            const secret = system.getOrThrow(AppSystemProp.STRIPE_WEBHOOK_SECRET)
            event = stripe.webhooks.constructEvent(request.rawBody as string, signature, secret)
        }
        catch (err) {
            request.log.warn({ err }, 'rejected billing webhook with invalid signature')
            return reply.status(StatusCodes.BAD_REQUEST).send('invalid signature')
        }

        try {
            await handleEvent(request.log, stripe, event)
            // await inside the try so a send failure is caught here, not surfaced as an unhandled rejection.
            return await reply.status(StatusCodes.OK).send({ received: true })
        }
        catch (err) {
            exceptionHandler.handle(err, request.log)
            request.log.error({ err, type: event.type }, 'billing webhook processing failed')
            // Signature was valid; surface a server error so the processor retries.
            return reply.status(StatusCodes.INTERNAL_SERVER_ERROR).send('processing failed')
        }
    })
}

async function handleEvent(log: Parameters<FastifyPluginAsyncZod>[0]['log'], stripe: Stripe, event: Stripe.Event): Promise<void> {
    switch (event.type) {
        case 'checkout.session.completed': {
            await onCheckoutCompleted(log, stripe, event.data.object)
            break
        }
        case 'invoice.paid': {
            await onInvoicePaid(log, event.data.object)
            break
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
            await onSubscriptionChanged(log, event.type, event.data.object as Stripe.Subscription)
            break
        }
        default:
            log.debug({ type: event.type }, 'unhandled billing webhook event')
    }
}

async function onCheckoutCompleted(log: Parameters<FastifyPluginAsyncZod>[0]['log'], stripe: Stripe, session: Stripe.Checkout.Session): Promise<void> {
    const metadata = session.metadata
    if (isNil(metadata) || isNil(metadata.platformId)) {
        return
    }
    const platformId = metadata.platformId
    if (metadata.type === StripeCheckoutType.CREDIT_PURCHASE) {
        const intent = await stripe.paymentIntents.retrieve(session.payment_intent as string)
        await platformAiCreditsService(log).creditPaymentSucceeded(platformId, intent.amount / 100, StripeCheckoutType.CREDIT_PURCHASE)
    }
    else if (metadata.type === StripeCheckoutType.CREDIT_AUTO_TOP_UP) {
        const setup = await stripe.setupIntents.retrieve(session.setup_intent as string)
        await platformAiCreditsService(log).handleAutoTopUpCheckoutSessionCompleted(platformId, setup.payment_method as string)
    }
}

async function onInvoicePaid(log: Parameters<FastifyPluginAsyncZod>[0]['log'], invoice: Stripe.Invoice): Promise<void> {
    const metadata = invoice.metadata
    if (isNil(metadata) || metadata.type !== StripeCheckoutType.CREDIT_AUTO_TOP_UP || isNil(metadata.platformId)) {
        return
    }
    await platformAiCreditsService(log).creditPaymentSucceeded(metadata.platformId, invoice.amount_paid / 100, StripeCheckoutType.CREDIT_AUTO_TOP_UP)
}

/**
 * Reconcile the organization's plan from a subscription event. This is the ONLY place a paid tier's
 * entitlements are written, and it writes them WHOLESALE from the tier's constant
 * (`planLimitsForName`) — never field-by-field — so a subscription can never leave a platform with a
 * half-applied entitlement set (e.g. the Agent unlocked but with no caps).
 *
 * A subscription carries a BASE-PLAN item plus optional metered ADD-ON items (extra active flows, AI
 * credits). Only the base-plan item identifies the tier; the add-ons compose on top of it.
 */
// Exported for direct testing: this is the function that turns money into entitlements, so it is
// verified against subscription shapes directly rather than only through a signed HTTP round-trip.
export async function onSubscriptionChanged(log: Parameters<FastifyPluginAsyncZod>[0]['log'], type: string, subscription: Stripe.Subscription): Promise<void> {
    const platformId = subscription.metadata?.platformId
    if (isNil(platformId)) {
        return
    }
    const ended = type === 'customer.subscription.deleted'
    if (ended) {
        // Subscription gone → fall back to the FREE tier of whichever product door this platform
        // uses, so a cancelling customer keeps the right (free) product, not an unrelated one.
        const freeTier = await freeTierForPlatform(log, platformId)
        await platformPlanService(log).update({
            ...freeTier,
            platformId,
            stripeSubscriptionStatus: IbSubscriptionStatus.CANCELED,
            stripeSubscriptionId: undefined,
            stripeSubscriptionStartDate: undefined,
            stripeSubscriptionEndDate: undefined,
            stripeSubscriptionCancelDate: undefined,
        })
        return
    }

    const { startDate, endDate, cancelDate } = await stripeHelper(log).getSubscriptionPeriod(subscription)

    // Identify the BASE plan: the one subscription item whose price maps to a known tier. Add-on
    // items (active-flow / ai-credit) deliberately do not map, so they are skipped here.
    const basePlan = subscription.items.data
        .map((item) => planPrice.planForPriceId(item.price.id, log))
        .find((plan) => !isNil(plan))

    if (isNil(basePlan)) {
        // The subscription carries no recognised tier. Do NOT guess a plan — guessing would grant
        // entitlements nobody paid for. Record the commercial state and leave entitlements alone.
        log.warn({ platformId, subscriptionId: subscription.id }, '[billing] subscription has no recognised base-plan price; entitlements left unchanged')
        await platformPlanService(log).update({
            platformId,
            stripeSubscriptionId: subscription.id,
            stripeSubscriptionStatus: subscription.status as IbSubscriptionStatus,
            stripeSubscriptionStartDate: startDate,
            stripeSubscriptionEndDate: endDate,
            stripeSubscriptionCancelDate: cancelDate ?? null,
        })
        return
    }

    // The tier's full entitlement set — one authoritative definition, applied wholesale.
    const limits = { ...planLimitsForName(basePlan) }

    // Compose the metered add-on: extra active flows are billed as their own line item, and ADD to
    // the tier's included allowance. (Matched by the add-on's own price id — not by the base item's,
    // which would be self-referential and always read back the base quantity.)
    const extraActiveFlows = subscription.items.data
        .filter((item) => item.price.id === stripeHelper(log).extraActiveFlowsPriceId())
        .reduce((sum, item) => sum + (item.quantity ?? 0), 0)
    if (extraActiveFlows > 0) {
        limits.activeFlowsLimit = (limits.activeFlowsLimit ?? 0) + extraActiveFlows
    }

    await platformPlanService(log).update({
        ...limits,
        platformId,
        plan: basePlan,
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: subscription.status as IbSubscriptionStatus,
        stripeSubscriptionStartDate: startDate,
        stripeSubscriptionEndDate: endDate,
        stripeSubscriptionCancelDate: cancelDate ?? null,
    })
}

/**
 * The free tier a platform reverts to when its subscription ends. Derived from the product door it
 * currently uses (the agent flag + its active-flow allowance), so an Agent customer lands on Agent
 * Free and a Studio customer on Studio Free — never the other product's plan.
 */
async function freeTierForPlatform(log: Parameters<FastifyPluginAsyncZod>[0]['log'], platformId: string): Promise<PlatformPlanWithOnlyLimits> {
    const plan = await platformPlanService(log).getOrCreateForPlatform(platformId)
    const hasAgent = plan.browserAgentEnabled === true
    const hasStudio = (plan.activeFlowsLimit ?? 0) > 0
    if (hasAgent && hasStudio) {
        return COMPLETE_FREE_PLAN
    }
    if (hasAgent) {
        return AGENT_FREE_PLAN
    }
    return STUDIO_FREE_PLAN
}
