// Clean-room implementation — license-key activation API (`/v1/license-keys`, capability spec
// G.4.a). Exactly two PUBLIC routes (the key is the credential):
//   GET  /v1/license-keys/:licenseKey — get-key: the key's entitlement document, or null if
//        unknown. No side effects (does not activate or apply).
//   POST /v1/license-keys/verify      — verify-and-apply: { licenseKey, platformId }. Verifies the
//        key (compose-verify) and, if valid, applies its entitlements to the organization's plan;
//        an invalid/expired/unknown key → INVALID_LICENSE_KEY (400).
//
// Registering the module also wires the daily expiry sweep (registerJobHandler + upsert a repeated
// schedule) so licensed organizations are re-verified and expired keys are downgraded. Registered
// unconditionally for every edition (the frontend calls verify in all editions).
import {
    IntellisperError,
    ErrorCode,
    LicenseKeyEntity,
    VerifyLicenseKeyRequestBody,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { licenseKeysExpirySweep } from './license-keys-expiry-sweep'
import { licenseKeysService } from './license-keys-service'

export const licenseKeysModule: FastifyPluginAsyncZod = async (app) => {
    // Boot verification: apply a license key configured via env to the deployment on startup.
    await licenseKeysService(app.log).verifyOnStartup()
    // Wire the daily expiry sweep (idempotent per process).
    await licenseKeysExpirySweep(app.log).init()
    await app.register(licenseKeysController, { prefix: '/v1/license-keys' })
}

const licenseKeysController: FastifyPluginAsyncZod = async (app) => {

    // Get-key — the key's entitlement document, or null if unknown. Public, no side effects.
    app.get('/:licenseKey', {
        config: { security: securityAccess.public() },
        schema: { params: z.object({ licenseKey: z.string() }) },
    }, async (request): Promise<LicenseKeyEntity | null> => {
        return licenseKeysService(request.log).getKey(request.params.licenseKey)
    })

    // Verify-and-apply — verify the key and, if valid, apply its entitlements to the plan.
    app.post('/verify', {
        config: { security: securityAccess.public() },
        schema: { body: VerifyLicenseKeyRequestBody },
    }, async (request, reply): Promise<LicenseKeyEntity> => {
        const service = licenseKeysService(request.log)
        const verified = await service.verifyKeyOrReturnNull({
            platformId: request.body.platformId,
            license: request.body.licenseKey,
        })
        if (verified === null) {
            throw new IntellisperError({
                code: ErrorCode.INVALID_LICENSE_KEY,
                params: { key: request.body.licenseKey },
            })
        }
        await service.applyLimits(request.body.platformId, verified)
        return reply.status(StatusCodes.OK).send(verified)
    })
}
