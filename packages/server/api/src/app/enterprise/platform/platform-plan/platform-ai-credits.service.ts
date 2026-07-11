// Clean-room implementation — managed AI-credit metering, renewal, and top-up
// (capability spec H.1 and G.3.5).
//
// Credits are tracked in an internal unit and converted to/from the provider's native
// currency (USD) at a fixed rate. The organization's managed provider key holds the
// balance; usage is read from the gateway and cached briefly. A periodic check renews
// the monthly included allowance and performs auto-top-up (fail-closed on the monthly
// ceiling). Provider keys are server-side only and never sent to clients.
import {
    AiCreditsAutoTopUpState,
    CreateAICreditCheckoutSessionParamsSchema,
    isNil,
    PlatformPlan,
    tryCatch,
    UpdateAICreditsAutoTopUpParamsSchema,
} from '@intelblocks/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { aiProviderService } from '../../../ai/ai-provider-service'
import { distributedLock, distributedStore } from '../../../database/redis-connections'
import { flagService } from '../../../flags/flag.service'
import { exceptionHandler } from '../../../helper/exception-handler'
import { sleep } from '../../../helper/sleep'
import { SystemJobName } from '../../../helper/system-jobs/common'
import { systemJobHandlers } from '../../../helper/system-jobs/job-handlers'
import { openRouterApi } from './openrouter/openrouter-api'
import { platformPlanService } from './platform-plan.service'
import { StripeCheckoutType, stripeHelper } from './stripe-helper'

// Internal credits per one currency unit (USD). A stable, documented conversion.
const CREDITS_PER_CURRENCY_UNIT = 1000
// Provider-usage read cache: short enough to reflect spend, long enough to keep the
// hot read off the gateway.
const USAGE_CACHE_TTL_SECONDS = 180
// After firing an auto-top-up we briefly yield so the payment settles before the next
// balance read would otherwise observe the pre-top-up figure.
const AUTO_TOP_UP_SETTLE_MS = 30_000

type CreditUsage = {
    limit: number
    usage: number
    usageMonthly: number
    usageRemaining: number
}

const usageCacheKey = (providerKeyHash: string): string => `managed_ai_usage:${providerKeyHash}`

export const platformAiCreditsService = (log: FastifyBaseLogger) => ({

    // Register the periodic renewal/top-up handler. Called once at startup in the
    // editions that offer managed AI.
    async init(): Promise<void> {
        systemJobHandlers.registerJobHandler(SystemJobName.AI_CREDIT_UPDATE_CHECK, async ({ platformId, apiKeyHash }) => {
            await distributedLock(log).runExclusive({
                key: `managed_ai_credit_check:${platformId}`,
                timeoutInSeconds: 100,
                fn: async () => {
                    const plan = await platformPlanService(log).getOrCreateForPlatform(platformId)
                    await renewMonthlyIncludedCredits(plan, apiKeyHash, log)
                    const toppedUp = await runAutoTopUpIfDue(plan, apiKeyHash, log)
                    if (toppedUp) {
                        await sleep(AUTO_TOP_UP_SETTLE_MS)
                    }
                },
            })
        })
    },

    isEnabled(): boolean {
        return flagService(log).aiCreditsEnabled()
    },

    // Per-organization credit usage in internal credits. When managed AI is disabled or
    // no provider key is provisioned yet, returns a zeroed/limit-only view rather than
    // failing (fail-safe read).
    async getUsage(platformId: string): Promise<CreditUsage> {
        if (!this.isEnabled()) {
            return { usage: 0, limit: 0, usageMonthly: 0, usageRemaining: 0 }
        }

        const providerAuth = await aiProviderService(log).getIntellisperProviderIfEnriched(platformId)
        if (isNil(providerAuth)) {
            const plan = await platformPlanService(log).getOrCreateForPlatform(platformId)
            return {
                usage: 0,
                limit: plan.includedAiCredits,
                usageMonthly: 0,
                usageRemaining: plan.includedAiCredits,
            }
        }

        const raw = await readProviderUsageCached(providerAuth.apiKeyHash, log)
        return {
            limit: toCredits(raw.limit ?? 0),
            usage: toCredits(raw.usage ?? 0),
            usageMonthly: toCredits(raw.usageMonthly ?? 0),
            usageRemaining: toCredits(raw.usageRemaining ?? 0),
        }
    },

    // Configure auto-top-up for an organization. Enabling requires a payment method on
    // file; when none exists, the caller is routed through a hosted setup flow and
    // auto-top-up stays disabled until the processor confirms the setup (via webhook).
    async updateAutoTopUp(platformId: string, request: UpdateAICreditsAutoTopUpParamsSchema): Promise<{ stripeCheckoutUrl?: string }> {
        const plan = await platformPlanService(log).getOrCreateForPlatform(platformId)

        if (request.state === AiCreditsAutoTopUpState.DISABLED) {
            await platformPlanService(log).update({ platformId, aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.DISABLED })
            return {}
        }

        await platformPlanService(log).update({
            platformId,
            aiCreditsAutoTopUpCreditsToAdd: request.creditsToAdd,
            aiCreditsAutoTopUpThreshold: request.minThreshold,
            maxAutoTopUpCreditsMonthly: request.maxMonthlyLimit,
        })

        const customerId = plan.stripeCustomerId
        if (isNil(customerId)) {
            return {}
        }
        const paymentMethod = await stripeHelper(log).getPaymentMethod(customerId)
        if (!isNil(paymentMethod)) {
            await platformPlanService(log).update({ platformId, aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.ENABLED })
            return {}
        }

        // No payment method yet — keep disabled and hand back a setup URL.
        await platformPlanService(log).update({ platformId, aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.DISABLED })
        const stripeCheckoutUrl = await stripeHelper(log).createAutoTopUpSetupSession({ platformId, customerId })
        return { stripeCheckoutUrl }
    },

    // Processor confirmed the payment-method setup: enable auto-top-up and attach the
    // method to the customer for off-session charges.
    async handleAutoTopUpCheckoutSessionCompleted(platformId: string, paymentMethodId: string): Promise<void> {
        await platformPlanService(log).update({ platformId, aiCreditsAutoTopUpState: AiCreditsAutoTopUpState.ENABLED })
        const plan = await platformPlanService(log).getOrCreateForPlatform(platformId)
        if (!isNil(plan.stripeCustomerId)) {
            await stripeHelper(log).attachPaymentMethod(paymentMethodId, plan.stripeCustomerId)
        }
    },

    // Start a one-off credit purchase (hosted checkout). Amount is given in internal
    // credits and converted to currency for the processor.
    async startCreditPurchase(platformId: string, { aiCredits }: CreateAICreditCheckoutSessionParamsSchema): Promise<{ stripeCheckoutUrl: string }> {
        const plan = await platformPlanService(log).getOrCreateForPlatform(platformId)
        if (isNil(plan.stripeCustomerId)) {
            throw new Error('Managed billing customer is not configured for this organization')
        }
        const stripeCheckoutUrl = await stripeHelper(log).createCreditPurchaseSession({
            platformId,
            customerId: plan.stripeCustomerId,
            amountInCurrency: toCurrency(aiCredits),
        })
        return { stripeCheckoutUrl }
    },

    // A confirmed payment credits the organization's balance by raising the managed
    // key's spend limit. Invoked from verified webhooks. The usage cache is invalidated
    // so a check in the same request observes the new balance.
    async creditPaymentSucceeded(platformId: string, amountInCurrency: number, _type: StripeCheckoutType): Promise<void> {
        const { apiKeyHash } = await aiProviderService(log).getOrCreateIntellisperProviderAuthConfig(platformId)
        await raiseKeyLimitBy(apiKeyHash, amountInCurrency)
        await distributedStore.delete(usageCacheKey(apiKeyHash))
    },

    // Grant a fixed currency amount of managed credit (e.g. a one-time free-chat grant),
    // provisioning the key if needed and invalidating the usage cache.
    async grantCredits({ platformId, amountInCurrency }: { platformId: string, amountInCurrency: number }): Promise<void> {
        const { apiKeyHash } = await aiProviderService(log).getOrCreateIntellisperProviderAuthConfig(platformId)
        await raiseKeyLimitBy(apiKeyHash, amountInCurrency)
        await distributedStore.delete(usageCacheKey(apiKeyHash))
    },
})

function toCredits(currencyAmount: number): number {
    return currencyAmount * CREDITS_PER_CURRENCY_UNIT
}

function toCurrency(credits: number): number {
    return credits / CREDITS_PER_CURRENCY_UNIT
}

async function raiseKeyLimitBy(providerKeyHash: string, amountInCurrency: number): Promise<void> {
    const { data: key } = await openRouterApi.getKey({ hash: providerKeyHash })
    await openRouterApi.updateKey({ hash: providerKeyHash, limit: (key.limit ?? 0) + amountInCurrency })
}

async function readProviderUsageCached(providerKeyHash: string, log: FastifyBaseLogger): Promise<CreditUsage> {
    const cacheKey = usageCacheKey(providerKeyHash)
    const cached = await distributedStore.get<CreditUsage>(cacheKey)
    if (!isNil(cached)) {
        return cached
    }

    const { data, error } = await tryCatch(() => openRouterApi.getKey({ hash: providerKeyHash }))
    if (!isNil(error) || isNil(data)) {
        exceptionHandler.handle(error, log)
        return { limit: 0, usage: 0, usageMonthly: 0, usageRemaining: 0 }
    }
    const key = data.data
    const value: CreditUsage = {
        limit: key.limit ?? 0,
        usage: key.usage ?? 0,
        usageMonthly: key.usage_monthly ?? 0,
        usageRemaining: key.limit_remaining ?? 0,
    }
    await distributedStore.put(cacheKey, value, USAGE_CACHE_TTL_SECONDS)
    return value
}

// Renew the monthly included allowance at most once per calendar month.
async function renewMonthlyIncludedCredits(plan: PlatformPlan, providerKeyHash: string, log: FastifyBaseLogger): Promise<void> {
    if (!isNil(plan.lastFreeAiCreditsRenewalDate) && dayjs().diff(dayjs(plan.lastFreeAiCreditsRenewalDate), 'month') < 1) {
        return
    }
    if (plan.includedAiCredits <= 0) {
        return
    }
    await raiseKeyLimitBy(providerKeyHash, toCurrency(plan.includedAiCredits))
    await platformPlanService(log).update({ platformId: plan.platformId, lastFreeAiCreditsRenewalDate: new Date().toISOString() })
}

// Fire one auto-top-up if enabled, below threshold, and within the monthly ceiling.
// Returns whether a charge was placed. Fails closed on any missing precondition.
async function runAutoTopUpIfDue(plan: PlatformPlan, providerKeyHash: string, log: FastifyBaseLogger): Promise<boolean> {
    if (plan.aiCreditsAutoTopUpState !== AiCreditsAutoTopUpState.ENABLED) {
        return false
    }
    if (isNil(plan.stripeCustomerId) || isNil(plan.aiCreditsAutoTopUpCreditsToAdd) || isNil(plan.aiCreditsAutoTopUpThreshold)) {
        return false
    }

    const { data: key } = await openRouterApi.getKey({ hash: providerKeyHash })
    const remainingCredits = toCredits(key.limit_remaining ?? 0)
    if (remainingCredits > plan.aiCreditsAutoTopUpThreshold) {
        return false
    }

    if (!isNil(plan.maxAutoTopUpCreditsMonthly) && plan.maxAutoTopUpCreditsMonthly > 0) {
        const spentThisMonthCurrency = await stripeHelper(log).getAutoTopUpTotalThisMonth(plan.stripeCustomerId, plan.platformId)
        const wouldBeTotalCredits = toCredits(spentThisMonthCurrency) + plan.aiCreditsAutoTopUpCreditsToAdd
        if (wouldBeTotalCredits > plan.maxAutoTopUpCreditsMonthly) {
            log.info({ platformId: plan.platformId }, 'Managed AI auto-top-up skipped: monthly ceiling reached')
            return false
        }
    }

    const paymentMethod = await stripeHelper(log).getPaymentMethod(plan.stripeCustomerId)
    if (isNil(paymentMethod)) {
        return false
    }

    await stripeHelper(log).chargeAutoTopUp({
        platformId: plan.platformId,
        customerId: plan.stripeCustomerId,
        amountInCurrency: toCurrency(plan.aiCreditsAutoTopUpCreditsToAdd),
        paymentMethod,
    })
    return true
}
