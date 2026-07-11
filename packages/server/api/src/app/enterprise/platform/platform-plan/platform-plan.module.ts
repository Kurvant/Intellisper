// Clean-room implementation — plan/billing module (capability spec G.3).
// Registers the organization billing/plan admin surface in enterprise and cloud; the
// processor webhook reconciler is registered only in cloud (where money moves).
import { IbEdition } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { system } from '../../../helper/system/system'
import { platformPlanController } from './platform-plan.controller'
import { stripeBillingController } from './stripe-billing.controller'

export const platformPlanModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(platformPlanController, { prefix: '/v1/platform-billing' })
    if (system.getEdition() === IbEdition.CLOUD) {
        await app.register(stripeBillingController, { prefix: '/v1/platform-billing' })
    }
}
