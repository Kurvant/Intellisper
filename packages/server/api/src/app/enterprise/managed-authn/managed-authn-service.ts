// Clean-room implementation — managed authentication (capability spec B.4 / embedding). Exchanges
// a host-signed external token for an authenticated Intellisper session, provisioning the managed
// user, workspace, membership and (optionally) an execution-concurrency pool as needed — so an
// embedding host can sign its end-users straight into a scoped workspace without them holding
// Intellisper credentials.
//
// Idempotent by external identity: the managed user is keyed by (platform, externalUserId) and the
// workspace by (platform, externalProjectId), so repeated exchanges SIGN IN rather than duplicate.
// Everything the token requests is scoped to the platform that owns the signing key that validated
// it (I.3 fail-safe scoping).
import {
    ibId,
    AuthenticationResponse,
    isNil,
    BlocksFilterType,
    PlatformRole,
    Project,
    ProjectType,
    User,
    UserIdentityProvider,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { authenticationUtils } from '../../authentication/authentication-utils'
import { userIdentityService } from '../../authentication/user-identity/user-identity-service'
import { repoFactory } from '../../core/db/repo-factory'
import { blockTagService } from '../../pieces/tags/pieces/piece-tag.service'
import { platformService } from '../../platform/platform.service'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { concurrencyPoolService } from '../platform/concurrency-pool/concurrency-pool.service'
import { projectMemberService } from '../projects/project-members/project-member.service'
import { ProjectPlanEntity } from '../projects/project-plan/project-plan.entity'
import { ExternalPrincipal, externalTokenExtractor } from './lib/external-token-extractor'

const projectPlanRepo = repoFactory(ProjectPlanEntity)

export const managedAuthnService = (log: FastifyBaseLogger) => ({
    // Exchange a host-signed external token for an authenticated session.
    async externalToken({ externalAccessToken }: { externalAccessToken: string }): Promise<AuthenticationResponse> {
        const principal = await externalTokenExtractor(log).extract(externalAccessToken)

        const user = await getOrCreateUser(log, principal)
        const project = await getOrCreateProject(log, principal)

        // Grant the user the token's role in the workspace (idempotent per (project, user)).
        await projectMemberService(log).upsert({
            projectId: project.id,
            userId: user.id,
            projectRoleName: principal.role,
        })

        await maybeAssignConcurrencyPool(log, principal, project.id)

        return authenticationUtils(log).getProjectAndToken({
            userId: user.id,
            platformId: principal.platformId,
            projectId: project.id,
        })
    },
})

// Resolve the managed user by (platform, externalUserId), creating the identity + user on first
// exchange. The identity is verified (the host vouched for it) and provisioned via the JWT
// provider; a deterministic synthetic email keeps the identity unique without collecting a real
// address.
async function getOrCreateUser(log: FastifyBaseLogger, principal: ExternalPrincipal): Promise<User> {
    const existing = await userService(log).getByPlatformAndExternalId({
        platformId: principal.platformId,
        externalId: principal.externalUserId,
    })
    if (!isNil(existing)) {
        return existing
    }
    const identity = await userIdentityService(log).create({
        email: managedUserEmail(principal),
        password: ibId(),
        firstName: principal.firstName,
        lastName: principal.lastName,
        trackEvents: true,
        newsLetter: false,
        provider: UserIdentityProvider.JWT,
        verified: true,
    })
    return userService(log).create({
        identityId: identity.id,
        platformId: principal.platformId,
        platformRole: PlatformRole.MEMBER,
        externalId: principal.externalUserId,
    })
}

// Resolve the managed workspace by (platform, externalProjectId), creating it (owned by the
// platform owner) on first exchange and applying the token's block-availability filter to its
// plan. An existing workspace is returned untouched (sign-in path).
async function getOrCreateProject(log: FastifyBaseLogger, principal: ExternalPrincipal): Promise<Project> {
    const existing = await projectService(log).getByPlatformIdAndExternalId({
        platformId: principal.platformId,
        externalId: principal.externalProjectId,
    })
    if (!isNil(existing)) {
        return existing
    }
    const platform = await platformService(log).getOneOrThrow(principal.platformId)
    const project = await projectService(log).create({
        displayName: principal.externalProjectId,
        ownerId: platform.ownerId,
        platformId: principal.platformId,
        externalId: principal.externalProjectId,
        type: ProjectType.TEAM,
    })
    await createProjectPlan(log, principal, project.id)
    return project
}

// Persist the new workspace's plan, resolving the token's optional block filter (an allow-list of
// TAGS) to the concrete block names available in the workspace.
async function createProjectPlan(log: FastifyBaseLogger, principal: ExternalPrincipal, projectId: string): Promise<void> {
    let blocksFilterType = BlocksFilterType.NONE
    let blocks: string[] = []
    if (!isNil(principal.blocks) && principal.blocks.filterType === BlocksFilterType.ALLOWED) {
        blocksFilterType = BlocksFilterType.ALLOWED
        blocks = await blockTagService.findByPlatformAndTags(principal.platformId, principal.blocks.tags)
    }
    await projectPlanRepo().save({
        id: ibId(),
        projectId,
        name: 'embed',
        locked: false,
        blocksFilterType,
        blocks,
    })
}

// When the token requests a named concurrency pool WITH a limit, create-or-reuse the pool for the
// platform (per key), assign it to the workspace, and refresh the dispatch cache. A key without a
// limit, or no key, leaves the workspace pool-less.
async function maybeAssignConcurrencyPool(log: FastifyBaseLogger, principal: ExternalPrincipal, projectId: string): Promise<void> {
    if (isNil(principal.concurrencyPoolKey) || isNil(principal.concurrencyPoolLimit)) {
        return
    }
    const { poolId } = await concurrencyPoolService(log).upsertPool({
        platformId: principal.platformId,
        key: principal.concurrencyPoolKey,
        maxConcurrentJobs: principal.concurrencyPoolLimit,
    })
    await projectService(log).update(projectId, { poolId })
    await concurrencyPoolService(log).assignProject({ projectId, poolId })
}

// A deterministic, unique synthetic email for a managed identity — stable per (platform, external
// user) so re-provisioning never collides, and clearly non-deliverable.
function managedUserEmail(principal: ExternalPrincipal): string {
    return `${principal.externalUserId}@${principal.platformId}.managed`
}
