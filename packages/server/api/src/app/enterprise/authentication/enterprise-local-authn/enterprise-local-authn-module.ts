// Clean-room implementation — local-account self-service HTTP surface (capability spec
// B.2). Public endpoints (no session required — the OTP is the credential) for confirming
// an email address and resetting a forgotten password. Both return an empty 200 on
// success; an invalid/expired/consumed code surfaces as INVALID_OTP (HTTP 410).
import { ResetPasswordRequestBody, VerifyEmailRequestBody } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { enterpriseLocalAuthnService } from './enterprise-local-authn-service'

export const enterpriseLocalAuthnModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(enterpriseLocalAuthnController, { prefix: '/v1/authn/local' })
}

const enterpriseLocalAuthnController: FastifyPluginAsyncZod = async (app) => {
    app.post('/verify-email', VerifyEmailRequest, async (request) => {
        await enterpriseLocalAuthnService(request.log).verifyEmail(request.body)
    })

    app.post('/reset-password', ResetPasswordRequest, async (request) => {
        await enterpriseLocalAuthnService(request.log).resetPassword(request.body)
    })
}

const VerifyEmailRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        body: VerifyEmailRequestBody,
    },
}

const ResetPasswordRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        body: ResetPasswordRequestBody,
    },
}
