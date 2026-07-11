// Clean-room implementation — payment-processor webhook reconciler (capability spec
// G.3.4). This endpoint is the source of truth for commercial plan state: it verifies
// the processor's signature over the raw body, then reconciles the organization's plan
// record from the event. It is safely repeatable (processors retry). When billing is
// inert (non-cloud) it acknowledges without acting.
import { IbSubscriptionStatus, isNil, PlanName, STANDARD_CLOUD_PLAN } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import Stripe from 'stripe'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { exceptionHandler } from '../../../helper/exception-handler'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
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
            return reply.status(StatusCodes.OK).send({ received: true })
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

async function onSubscriptionChanged(log: Parameters<FastifyPluginAsyncZod>[0]['log'], type: string, subscription: Stripe.Subscription): Promise<void> {
    const platformId = subscription.metadata?.platformId
    if (isNil(platformId)) {
        return
    }
    const ended = type === 'customer.subscription.deleted'
    if (ended) {
        // Reset to the default tier's entitlements and clear subscription references.
        await platformPlanService(log).update({
            ...STANDARD_CLOUD_PLAN,
            platformId,
            plan: PlanName.STANDARD,
            stripeSubscriptionStatus: IbSubscriptionStatus.CANCELED,
            stripeSubscriptionId: undefined,
            stripeSubscriptionStartDate: undefined,
            stripeSubscriptionEndDate: undefined,
            stripeSubscriptionCancelDate: undefined,
        })
        return
    }

    const { startDate, endDate, cancelDate } = await stripeHelper(log).getSubscriptionPeriod(subscription)
    const priceId = subscription.items.data[0]?.price.id
    const extraActiveFlows = subscription.items.data.find((it) => it.price.id === priceId)?.quantity ?? 0
    const limits = { ...STANDARD_CLOUD_PLAN }
    if (extraActiveFlows > 0) {
        limits.activeFlowsLimit = (limits.activeFlowsLimit ?? 0) + extraActiveFlows
    }

    await platformPlanService(log).update({
        ...limits,
        platformId,
        plan: PlanName.STANDARD,
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: subscription.status as IbSubscriptionStatus,
        stripeSubscriptionStartDate: startDate,
        stripeSubscriptionEndDate: endDate,
        stripeSubscriptionCancelDate: cancelDate ?? null,
    })
}
