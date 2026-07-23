// Clean-room implementation — super-administrator (operator) platform surface
// (capability spec C.5). These endpoints act across organizations and are therefore not
// tenant-facing. The whole surface is guarded by the operator API key presented in a
// request header; individual routes are otherwise public (the header check is the gate),
// mirroring the operator-tooling access model.
import { BlockMetadata } from '@intelblocks/blocks-framework'
import { AdminRetryRunsRequestBody, ApplyLicenseKeyByEmailRequestBody, BlockCategory, BlockType, ExactVersionType, IbId, IncreaseAICreditsForPlatformRequestBody, isNil, PackageType } from '@intelblocks/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { blockMetadataService } from '../../../pieces/metadata/piece-metadata-service'
import { CANARY_WORKER_GROUP_ID, workerGroupService } from '../platform-plan/worker-group.service'
import { adminPlatformService } from './admin-platform.service'

const OPERATOR_KEY_HEADER = 'api-key'

// Gate the whole surface on the configured operator key. If no operator key is
// configured, the surface is closed (deny by default).
async function assertOperatorKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const configuredKey = system.get(AppSystemProp.API_KEY)
    const presentedKey = request.headers[OPERATOR_KEY_HEADER] as string | undefined
    if (isNil(configuredKey) || presentedKey !== configuredKey) {
        await reply.status(StatusCodes.FORBIDDEN).send({ message: 'Forbidden' })
        throw new Error('Forbidden')
    }
}

export const adminPlatformModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preHandler', assertOperatorKey)
    await app.register(adminPlatformController, { prefix: '/v1/admin' })
}

const adminPlatformController: FastifyPluginAsyncZod = async (app) => {

    // Register an official (platform-owned) integration.
    app.post('/blocks', CreateOfficialBlockRequest, async (request) => {
        return blockMetadataService(request.log).create({
            blockMetadata: request.body as unknown as BlockMetadata,
            packageType: PackageType.REGISTRY,
            blockType: BlockType.OFFICIAL,
        })
    })

    // Bulk operational remediation: re-run a selected set of failed executions.
    app.post('/platforms/runs/retry', RetryRunsRequest, async (request, reply) => {
        await adminPlatformService(request.log).retryRuns(request.body)
        return reply.status(StatusCodes.OK).send()
    })

    // Attach an entitlement grant to the organization located by an admin's email.
    app.post('/platforms/apply-license-key', ApplyLicenseKeyRequest, async (request, reply) => {
        await adminPlatformService(request.log).applyLicenseKeyByEmail(request.body)
        return reply.status(StatusCodes.OK).send()
    })

    // Grant/increase an organization's managed AI-credit allowance.
    app.post('/platforms/increase-ai-credits', IncreaseAiCreditsRequest, async (request, reply) => {
        await adminPlatformService(request.log).increaseAiCredits(request.body)
        return reply.status(StatusCodes.OK).send()
    })

    // Assign an organization to a named execution group (migrating its queued work).
    app.post('/platforms/worker-group', UpdateWorkerGroupRequest, async (request, reply) => {
        const { platformId, workerGroupId } = request.body
        await workerGroupService(request.log).updateWorkerGroup({ platformId, workerGroupId })
        return reply.status(StatusCodes.OK).send()
    })

    // Toggle canary routing for an organization.
    app.post('/platforms/canary', UpdateCanaryRequest, async (request, reply) => {
        const { platformId, canary } = request.body
        await workerGroupService(request.log).updateWorkerGroup({
            platformId,
            workerGroupId: canary ? CANARY_WORKER_GROUP_ID : null,
        })
        return reply.status(StatusCodes.OK).send()
    })
}

const publicRoute = { config: { security: securityAccess.public() } }

const RetryRunsRequest = { ...publicRoute, schema: { body: AdminRetryRunsRequestBody } }
const ApplyLicenseKeyRequest = { ...publicRoute, schema: { body: ApplyLicenseKeyByEmailRequestBody } }
const IncreaseAiCreditsRequest = { ...publicRoute, schema: { body: IncreaseAICreditsForPlatformRequestBody } }

const UpdateWorkerGroupRequest = {
    ...publicRoute,
    schema: { body: z.object({ platformId: IbId, workerGroupId: z.string().nullable() }) },
}

const UpdateCanaryRequest = {
    ...publicRoute,
    schema: { body: z.object({ platformId: IbId, canary: z.boolean() }) },
}

const CreateOfficialBlockRequest = {
    ...publicRoute,
    schema: {
        body: z.object({
            name: z.string(),
            displayName: z.string(),
            logoUrl: z.string(),
            description: z.string().optional(),
            version: ExactVersionType,
            auth: z.unknown().optional(),
            authors: z.array(z.string()),
            categories: z.array(z.nativeEnum(BlockCategory)).optional(),
            // Both release bounds are OPTIONAL in the canonical BlockMetadata type
            // (blocks/framework/src/lib/piece-metadata.ts) and in the service layer that persists
            // them. Real block metadata omits maximumSupportedRelease entirely (all 700+ community
            // blocks leave it unset), so requiring it here rejected every genuine block with a 400
            // and made catalogue seeding impossible. Match the model, not a stricter invention.
            minimumSupportedRelease: ExactVersionType.optional(),
            maximumSupportedRelease: ExactVersionType.optional(),
            actions: z.record(z.string(), z.unknown()),
            triggers: z.record(z.string(), z.unknown()),
            i18n: z.record(z.string(), z.record(z.string(), z.string())).optional(),
        }),
    },
}
