// Clean-room implementation — managed authentication API (`/v1/managed-authn`, capability spec
// B.4 / embedding). A single PUBLIC endpoint that exchanges a host-signed external token for an
// authenticated Intellisper session: the token IS the credential (verified against the platform's
// signing key), so no prior session is required. Registered in CLOUD / ENTERPRISE only.
import { AuthenticationResponse, ManagedAuthnRequestBody } from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { managedAuthnService } from './managed-authn-service'

export const managedAuthnModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(managedAuthnController, { prefix: '/v1/managed-authn' })
}

const managedAuthnController: FastifyPluginAsyncZod = async (app) => {

    // Exchange a host-signed external token for an authenticated session (provisioning the managed
    // user / workspace / membership as needed). Public: the signed token is the credential.
    app.post('/external-token', {
        config: {
            security: securityAccess.public(),
        },
        schema: {
            body: ManagedAuthnRequestBody,
        },
    }, async (request, reply): Promise<AuthenticationResponse> => {
        const response = await managedAuthnService(request.log).externalToken({
            externalAccessToken: request.body.externalAccessToken,
        })
        return reply.status(StatusCodes.OK).send(response)
    })
}
