// Clean-room implementation — super-administrator cross-organization operations
// (capability spec C.5). These are operator-only actions, not tenant-facing: they act
// across organizations and are guarded by the operator API key at the module boundary.
import {
    AdminRetryRunsRequestBody,
    ApplyLicenseKeyByEmailRequestBody,
    ErrorCode,
    FlowRetryStrategy,
    IncreaseAICreditsForPlatformRequestBody,
    IntellisperError,
    isNil,
    PlatformRole,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { aiProviderService } from '../../../ai/ai-provider-service'
import { userIdentityService } from '../../../authentication/user-identity/user-identity-service'
import { flowRunRepo, flowRunService } from '../../../flows/flow-run/flow-run-service'
import { platformRepo } from '../../../platform/platform.service'
import { userRepo } from '../../../user/user-service'
import { licenseKeysService } from '../../license-keys/license-keys-service'
import { openRouterApi } from '../platform-plan/openrouter/openrouter-api'

export const adminPlatformService = (log: FastifyBaseLogger) => ({

    // Operational remediation: re-run a selected set of failed executions from their
    // failed step. Runs are grouped by their owning workspace and each group is retried
    // in one call, because retry is a workspace-scoped operation.
    async retryRuns({ runIds, createdAfter, createdBefore }: AdminRetryRunsRequestBody): Promise<void> {
        const runs = await flowRunRepo().find({
            where: { id: In(runIds ?? []) },
            select: ['id', 'projectId'],
        })

        const runIdsByWorkspace = new Map<string, string[]>()
        for (const run of runs) {
            const list = runIdsByWorkspace.get(run.projectId) ?? []
            list.push(run.id)
            runIdsByWorkspace.set(run.projectId, list)
        }

        for (const [projectId, flowRunIds] of runIdsByWorkspace) {
            await flowRunService(log).bulkRetry({
                projectId,
                flowRunIds,
                strategy: FlowRetryStrategy.FROM_FAILED_STEP,
                createdAfter,
                createdBefore,
            })
        }
    },

    // Attach an entitlement grant (license) to the organization located by an
    // administrator's email (spec C.5). The email → admin user → owned organization
    // resolution is validated here (and fails clearly if the operator names a non-existent
    // account); the license is then verified and applied through the SAME compose-verify +
    // apply-limits path (G.4.a) as the tenant-facing verify endpoint, so behavior is identical
    // however a key is applied. An invalid/expired key is rejected.
    async applyLicenseKeyByEmail({ email, licenseKey }: ApplyLicenseKeyByEmailRequestBody): Promise<void> {
        const platform = await resolveOwnedPlatformByAdminEmail(email, log)
        const service = licenseKeysService(log)
        const verified = await service.verifyKeyOrReturnNull({ platformId: platform.id, license: licenseKey })
        if (isNil(verified)) {
            throw new IntellisperError({
                code: ErrorCode.INVALID_LICENSE_KEY,
                params: { key: licenseKey },
            })
        }
        await service.applyLimits(platform.id, verified)
    },

    // Grant/increase an organization's managed AI-credit allowance by raising its managed
    // provider key's spend limit. Provisions the key if the organization does not yet
    // have one, so the same key is reused by execution afterwards.
    async increaseAiCredits({ platformId, amountInUsd }: IncreaseAICreditsForPlatformRequestBody): Promise<void> {
        const { apiKeyHash } = await aiProviderService(log).getOrCreateIntellisperProviderAuthConfig(platformId)
        const { data: key } = await openRouterApi.getKey({ hash: apiKeyHash })
        await openRouterApi.updateKey({ hash: apiKeyHash, limit: (key.limit ?? 0) + amountInUsd })
    },
})

async function resolveOwnedPlatformByAdminEmail(email: string, log: FastifyBaseLogger) {
    const identity = await userIdentityService(log).getIdentityByEmail(email)
    if (isNil(identity)) {
        throw new IntellisperError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'user_identity', entityId: email } })
    }
    const adminUser = await userRepo().findOneBy({ identityId: identity.id, platformRole: PlatformRole.ADMIN })
    if (isNil(adminUser)) {
        throw new IntellisperError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'user', entityId: email } })
    }
    const platform = await platformRepo().findOneBy({ ownerId: adminUser.id })
    if (isNil(platform)) {
        throw new IntellisperError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'platform', entityId: adminUser.id } })
    }
    return platform
}
