// Clean-room implementation — one-time verification code endpoint (capability spec B.2).
// Public endpoint that issues and delivers a purpose-bound code for an email. It always
// returns no-content regardless of whether the email exists, so it never reveals which
// addresses are registered.
import { CreateOtpRequestBody } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { platformUtils } from '../../../platform/platform.utils'
import { otpService } from './otp-service'

export const otpModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(otpController, { prefix: '/v1/otp' })
}

const otpController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateOtpRequest, async (request, reply) => {
        const platformId = await platformUtils.getPlatformIdForRequest(request)
        await otpService(request.log).createAndSend({
            platformId,
            email: request.body.email,
            type: request.body.type,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const CreateOtpRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        body: CreateOtpRequestBody,
    },
}
