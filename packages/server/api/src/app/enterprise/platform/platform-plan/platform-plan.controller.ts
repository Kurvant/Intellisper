// Clean-room implementation — organization billing/plan HTTP surface (capability spec
// G.3). All routes are organization-administrator only. Reads compose the plan record,
// the live usage snapshot, and next-billing info; writes initiate processor-hosted flows
// (checkout, portal, credit purchase, auto-top-up). Actual plan-state changes are applied
// by the webhook reconciler, not here.
import {
    CreateAICreditCheckoutSessionParamsSchema,
    CreateCheckoutSessionParamsSchema,
    PlatformBillingInformation,
    PrincipalType,
    STANDARD_CLOUD_PLAN,
    UpdateActiveFlowsAddonParamsSchema,
    UpdateAICreditsAutoTopUpParamsSchema,
} from '@intelblocks/shared'
import { assertNotNullOrUndefined } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { platformAiCreditsService } from './platform-ai-credits.service'
import { platformPlanService } from './platform-plan.service'
import { stripeHelper } from './stripe-helper'

const adminOnly = { config: { security: securityAccess.platformAdminOnly([PrincipalType.USER]) } }

export const platformPlanController: FastifyPluginAsyncZod = async (app) => {

    app.get('/info', {
        ...adminOnly,
        schema: { response: { [StatusCodes.OK]: PlatformBillingInformation } },
    }, async (request) => {
        const platformId = request.principal.platform.id
        const [plan, usage] = await Promise.all([
            platformPlanService(request.log).getOrCreateForPlatform(platformId),
            platformPlanService(request.log).getUsage(platformId),
        ])
        const nextBillingDate = plan.stripeSubscriptionEndDate ?? 0
        const nextBillingAmount = await stripeHelper(request.log).getNextBillingAmount(plan.stripeSubscriptionId)
        const response: PlatformBillingInformation = {
            plan,
            usage,
            nextBillingDate,
            nextBillingAmount,
            cancelAt: plan.stripeSubscriptionCancelDate ?? null,
        }
        return response
    })

    app.post('/portal', adminOnly, async (request) => {
        return stripeHelper(request.log).createPortalSession(request.principal.platform.id)
    })

    app.post('/create-checkout-session', {
        ...adminOnly,
        schema: { body: CreateCheckoutSessionParamsSchema },
    }, async (request) => {
        const plan = await platformPlanService(request.log).getOrCreateForPlatform(request.principal.platform.id)
        assertNotNullOrUndefined(plan.stripeCustomerId, 'billing customer is not set')
        const includedLimit = STANDARD_CLOUD_PLAN.activeFlowsLimit ?? 0
        const extraActiveFlows = Math.max(0, request.body.newActiveFlowsLimit - includedLimit)
        return stripeHelper(request.log).createSubscriptionCheckout({
            platformId: plan.platformId,
            customerId: plan.stripeCustomerId,
            extraActiveFlows,
        })
    })

    app.post('/update-active-flows-addon', {
        ...adminOnly,
        schema: { body: UpdateActiveFlowsAddonParamsSchema },
    }, async (request) => {
        const plan = await platformPlanService(request.log).getOrCreateForPlatform(request.principal.platform.id)
        assertNotNullOrUndefined(plan.stripeSubscriptionId, 'no active subscription')
        const includedLimit = STANDARD_CLOUD_PLAN.activeFlowsLimit ?? 0
        const currentLimit = plan.activeFlowsLimit ?? 0
        const newLimit = request.body.newActiveFlowsLimit
        return stripeHelper(request.log).changeSubscription({
            subscriptionId: plan.stripeSubscriptionId,
            extraActiveFlows: Math.max(0, newLimit - includedLimit),
            isUpgrade: newLimit > currentLimit,
            isFreeDowngrade: newLimit === includedLimit,
        })
    })

    app.post('/ai-credits/create-checkout-session', {
        ...adminOnly,
        schema: {
            body: CreateAICreditCheckoutSessionParamsSchema,
            response: { [StatusCodes.OK]: z.object({ stripeCheckoutUrl: z.string() }) },
        },
    }, async (request) => {
        return platformAiCreditsService(request.log).startCreditPurchase(request.principal.platform.id, request.body)
    })

    app.post('/ai-credits/auto-topup', {
        ...adminOnly,
        schema: {
            body: UpdateAICreditsAutoTopUpParamsSchema,
            response: { [StatusCodes.OK]: z.object({ stripeCheckoutUrl: z.string().optional() }) },
        },
    }, async (request) => {
        return platformAiCreditsService(request.log).updateAutoTopUp(request.principal.platform.id, request.body)
    })
}
