// Clean-room implementation — project (workspace) management API (`/v1/projects`).
//
// COMMUNITY-CRITICAL: this is the only module serving `/v1/projects`, used in every edition
// to list/create/update/delete workspaces. It is backed by the MIT core
// `projectService`/`userService`/`platformService`; the route contract (paths, methods,
// request/response shapes, status codes, authorization rules) is derived from the repo's own
// integration tests and MIT shared types — not from any licensed source.
//
// Authorization model (spec I.2/I.3):
//   - Enumeration (Guarantee A): a **privileged** caller (platform ADMIN/OPERATOR, or a
//     SERVICE/API-key principal) sees every workspace in its organization; a non-privileged
//     user sees only the workspaces they own personally plus the shared workspaces they hold
//     a membership in. The `externalUserId` filter resolves results on behalf of another
//     user and is a **service-caller-only** facility (an interactive user may never act as
//     another user through it).
//   - Mutation (create/update/delete) requires platform ownership (ADMIN), except that an
//     update may also be performed by a caller whose token is scoped to that exact project.
//   - Every lookup is platform-scoped: a target in another organization surfaces as
//     ENTITY_NOT_FOUND (404), never leaking cross-tenant existence.
import {
    BlocksFilterType,
    CreatePlatformProjectRequest,
    ErrorCode,
    IntellisperError,
    isNil,
    ListProjectRequestForPlatformQueryParams,
    PlatformRole,
    PrincipalType,
    Project,
    ProjectType,
    ProjectWithLimits,
    SeekPage,
    TeamProjectsLimit,
    UpdateProjectPlatformRequest,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { appConnectionService } from '../../app-connection/app-connection-service/app-connection-service'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { platformService } from '../../platform/platform.service'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { platformProjectService } from './platform-project-service'

function toProjectWithLimits(project: Project): ProjectWithLimits {
    return {
        id: project.id,
        created: project.created,
        updated: project.updated,
        ownerId: project.ownerId,
        displayName: project.displayName,
        type: project.type,
        platformId: project.platformId,
        externalId: project.externalId,
        maxConcurrentJobs: project.maxConcurrentJobs,
        icon: project.icon,
        releasesEnabled: project.releasesEnabled,
        metadata: project.metadata,
        // Base per-project plan (no governance/limits configured in the base edition). Real
        // plan resolution is an enterprise capability layered on separately.
        plan: {
            id: project.id,
            created: project.created,
            updated: project.updated,
            projectId: project.id,
            locked: false,
            name: 'free',
            blocksFilterType: BlocksFilterType.NONE,
            blocks: [],
        },
        // Read-time analytics; zeroed base values.
        analytics: {
            totalUsers: 0,
            activeUsers: 0,
            totalFlows: 0,
            activeFlows: 0,
        },
    }
}

export const platformProjectModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(platformProjectController, { prefix: '/v1/projects' })
}

const platformProjectController: FastifyPluginAsyncZod = async (app) => {

    // List the caller's accessible workspaces within their organization. Any authenticated
    // member of the organization may list — non-privileged callers simply see a narrower set
    // (their own personal workspace plus shared workspaces they belong to), which may be
    // empty; the fine-grained authorization is applied per-caller in the handler.
    app.get('/', {
        config: {
            security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
        },
        schema: {
            tags: ['projects'],
            summary: 'List projects',
            description: 'List the workspaces the caller can access within their organization.',
            querystring: ListProjectRequestForPlatformQueryParams,
        },
    }, async (request): Promise<SeekPage<ProjectWithLimits>> => {
        const platformId = request.principal.platform.id
        const projects = await listAccessibleProjects({
            principal: request.principal,
            platformId,
            externalUserId: request.query.externalUserId,
            displayName: request.query.displayName,
            log: request.log,
        })
        return {
            data: projects.map(toProjectWithLimits),
            next: null,
            previous: null,
        }
    })

    // Create a team workspace under the caller's organization. Returns 201.
    app.post('/', {
        config: {
            security: securityAccess.nonEmbedUsersOnly([PrincipalType.USER, PrincipalType.SERVICE]),
        },
        schema: {
            tags: ['projects'],
            summary: 'Create a project',
            description: 'Create a team workspace under the caller\'s organization.',
            body: CreatePlatformProjectRequest,
        },
    }, async (request, reply): Promise<ProjectWithLimits> => {
        const platformId = request.principal.platform.id
        // Pre-action quota guard (spec I.7a / gap-report tri-state team limit): a team
        // workspace may only be created within the plan's team-projects allowance.
        await assertTeamProjectAllowed({ platformId, log: request.log })
        // The workspace owner is the interactive user, or (for a service/API-key principal
        // that has no user identity) the organization's owner.
        const ownerId = await resolveOwnerId({ principal: request.principal, platformId, log: request.log })
        const project = await projectService(request.log).create({
            ownerId,
            displayName: request.body.displayName,
            type: ProjectType.TEAM,
            platformId,
            externalId: request.body.externalId ?? undefined,
            metadata: request.body.metadata ?? undefined,
            maxConcurrentJobs: request.body.maxConcurrentJobs ?? undefined,
            // Establishment variation point (spec I.7 / A.2): register a default alert
            // receiver when one is supplied. A best-effort side effect that never corrupts
            // the workspace.
            postCreateContext: { alertReceiverEmail: request.body.alertReceiverEmail },
        })
        // Attach any selected organization-shared connections (spec E.1), gated on the
        // shared-connections entitlement.
        await reconcileGlobalConnections({
            platformId,
            projectId: project.id,
            connectionExternalIds: request.body.globalConnectionExternalIds,
            log: request.log,
        })
        return reply.status(StatusCodes.CREATED).send(toProjectWithLimits(project))
    })

    // Update a workspace. Allowed for a caller who owns the platform (ADMIN) or whose token
    // is scoped to that exact project.
    app.post('/:id', {
        config: {
            security: securityAccess.nonEmbedUsersOnly([PrincipalType.USER, PrincipalType.SERVICE]),
        },
        schema: {
            tags: ['projects'],
            summary: 'Update a project',
            description: 'Update a workspace. Requires platform ownership or a token scoped to it.',
            params: z.object({ id: z.string() }),
            body: UpdateProjectPlatformRequest,
        },
    }, async (request): Promise<ProjectWithLimits> => {
        const platformId = request.principal.platform.id
        const project = await getProjectInPlatformOrThrow(request.params.id, platformId, request.log)
        await assertMayMutateProject({ principal: request.principal, project, platformId, log: request.log })
        const updated = await projectService(request.log).update(project.id, {
            type: ProjectType.TEAM,
            displayName: request.body.displayName,
            externalId: request.body.externalId,
            releasesEnabled: request.body.releasesEnabled,
            metadata: request.body.metadata,
            maxConcurrentJobs: request.body.maxConcurrentJobs,
            icon: request.body.icon,
        })
        // Reconcile the workspace's organization-shared connections (spec E.1 / I.5), gated
        // on the shared-connections entitlement.
        await reconcileGlobalConnections({
            platformId,
            projectId: project.id,
            connectionExternalIds: request.body.globalConnectionExternalIds,
            log: request.log,
        })
        return toProjectWithLimits(updated)
    })

    // Soft-delete a workspace (two-stage removal; the async cascade is handled by the
    // HARD_DELETE_PROJECT job). Requires platform ownership; a target in another organization
    // is not found (404) and left untouched.
    app.delete('/:id', {
        config: {
            security: securityAccess.nonEmbedUsersOnly([PrincipalType.USER, PrincipalType.SERVICE]),
        },
        schema: {
            tags: ['projects'],
            summary: 'Delete a project',
            description: 'Soft-delete a workspace. Requires platform ownership.',
            params: z.object({ id: z.string() }),
        },
    }, async (request, reply): Promise<void> => {
        const platformId = request.principal.platform.id
        const project = await getProjectInPlatformOrThrow(request.params.id, platformId, request.log)
        await assertIsPlatformOwner({ principal: request.principal, platformId, log: request.log })
        await platformProjectService(request.log).markForDeletion({
            id: project.id,
            platformId,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

// Resolve the set of workspaces the caller may enumerate, honoring the externalUserId rules.
async function listAccessibleProjects({ principal, platformId, externalUserId, displayName, log }: ListAccessibleParams): Promise<Project[]> {
    // externalUserId is a service-caller-only facility: an interactive user may never resolve
    // results on behalf of another user through it (spec I.5 enumeration rule).
    if (!isNil(externalUserId)) {
        if (principal.type !== PrincipalType.SERVICE) {
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'externalUserId is only permitted for service principals.' },
            })
        }
        const targetUser = await userService(log).getByPlatformAndExternalId({ platformId, externalId: externalUserId })
        if (isNil(targetUser)) {
            return []
        }
        // Non-privileged scope for the *targeted* user: their personal workspace plus the
        // shared workspaces they hold a membership in.
        return projectService(log).getAllForUser({
            platformId,
            userId: targetUser.id,
            isPrivileged: false,
            displayName,
        })
    }

    // A service/API-key principal is organization-scoped and privileged: it sees every
    // workspace on its platform.
    if (principal.type === PrincipalType.SERVICE) {
        return projectService(log).getAllForUser({
            platformId,
            userId: principal.id,
            isPrivileged: true,
            displayName,
        })
    }

    // Interactive user: privilege depends on their platform role.
    const user = await userService(log).getOneOrFail({ id: principal.id })
    return projectService(log).getAllForUser({
        platformId,
        userId: user.id,
        isPrivileged: userService(log).isUserPrivileged(user),
        displayName,
    })
}

// Reconcile the organization-shared (global) connections attached to a workspace from a
// requested set of connection external ids (spec E.1). Gated on the shared-connections
// entitlement: when the plan does not include it, the request is silently ignored (never an
// error — the workspace is still valid). An *absent* set leaves current attachments untouched
// (distinct from an empty set, which detaches all).
async function reconcileGlobalConnections({ platformId, projectId, connectionExternalIds, log }: ReconcileParams): Promise<void> {
    if (isNil(connectionExternalIds)) {
        return
    }
    const platform = await platformService(log).getOneWithPlanOrThrow(platformId)
    if (!platform.plan.globalConnectionsEnabled) {
        return
    }
    await appConnectionService(log).reconcileProjectGlobalConnections({
        platformId,
        projectId,
        connectionExternalIds,
    })
}

// Pre-action guard for team-workspace creation: the plan's team-projects limit is tri-state
// (spec gap-report). NONE ⇒ team workspaces are not available at all; ONE ⇒ at most a single
// team workspace may exist (a second is denied); UNLIMITED ⇒ no cap. A denied create surfaces
// as FEATURE_DISABLED (402 Payment Required) — a plan/entitlement matter, distinct from an
// authorization failure.
async function assertTeamProjectAllowed({ platformId, log }: { platformId: string, log: FastifyBaseLogger }): Promise<void> {
    const platform = await platformService(log).getOneWithPlanOrThrow(platformId)
    const limit = platform.plan.teamProjectsLimit
    if (limit === TeamProjectsLimit.UNLIMITED) {
        return
    }
    if (limit === TeamProjectsLimit.NONE) {
        throw new IntellisperError({
            code: ErrorCode.FEATURE_DISABLED,
            params: { message: 'Team projects are not available on your plan.' },
        })
    }
    // limit === ONE: allow only if no team workspace exists yet.
    const existingTeamProjects = await projectService(log).countByPlatformIdAndType(platformId, ProjectType.TEAM)
    if (existingTeamProjects >= 1) {
        throw new IntellisperError({
            code: ErrorCode.FEATURE_DISABLED,
            params: { message: 'Your plan allows only one team project. Upgrade to add more.' },
        })
    }
}

// The workspace owner for a create: the interactive user's id, or the organization owner's id
// for a service/API-key principal (which has no user identity of its own).
async function resolveOwnerId({ principal, platformId, log }: PrincipalPlatformParams): Promise<string> {
    if (principal.type === PrincipalType.USER) {
        return principal.id
    }
    const platform = await platformService(log).getOneOrThrow(platformId)
    return platform.ownerId
}

// Fetch a project that belongs to the caller's organization, or throw ENTITY_NOT_FOUND. A
// project in another organization is reported as not-found (never a 403) so cross-tenant
// existence cannot be enumerated.
async function getProjectInPlatformOrThrow(projectId: string, platformId: string, log: FastifyBaseLogger): Promise<Project> {
    const project = await projectService(log).getOne(projectId)
    if (isNil(project) || project.platformId !== platformId || !isNil(project.deleted)) {
        throw new IntellisperError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityId: projectId, entityType: 'project' },
        })
    }
    return project
}

// A caller may update a workspace if they own the platform, or if their token is scoped to
// that exact project.
async function assertMayMutateProject({ principal, project, platformId, log }: AssertMutateParams): Promise<void> {
    const scopedProjectId = (principal as { projectId?: string }).projectId
    if (!isNil(scopedProjectId) && scopedProjectId === project.id) {
        return
    }
    await assertIsPlatformOwner({ principal, platformId, log })
}

// Assert the caller owns the platform (has the ADMIN platform role). Service/API-key
// principals act on behalf of the organization and are treated as owner-equivalent. This is
// role-based (matching the platform-ownership guard): a former owner demoted to MEMBER is no
// longer authorized.
async function assertIsPlatformOwner({ principal, log }: PrincipalPlatformParams): Promise<void> {
    if (principal.type === PrincipalType.SERVICE) {
        return
    }
    const user = await userService(log).getOneOrFail({ id: principal.id })
    if (user.platformRole !== PlatformRole.ADMIN) {
        throw new IntellisperError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'Only the platform owner may perform this action.' },
        })
    }
}

type ListAccessibleParams = {
    principal: { type: PrincipalType, id: string, platform: { id: string } }
    platformId: string
    externalUserId: string | undefined
    displayName: string | undefined
    log: FastifyBaseLogger
}

type PrincipalPlatformParams = {
    principal: { type: PrincipalType, id: string }
    platformId: string
    log: FastifyBaseLogger
}

type AssertMutateParams = PrincipalPlatformParams & {
    project: Project
}

type ReconcileParams = {
    platformId: string
    projectId: string
    connectionExternalIds: string[] | undefined
    log: FastifyBaseLogger
}
