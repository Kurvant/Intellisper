// Clean-room implementation — project release API (/v1/project-releases, capability spec
// J.1). Version/environment promotion of a workspace's automation state. The whole feature
// is entitlement-gated on the platform plan's `environmentsEnabled` flag; every route is
// project-scoped so a caller can only act on releases of a workspace they belong to (cross-
// project access is rejected 403 by the project security guard), and a PROJECT-release's
// target workspace is additionally validated to belong to the caller's platform (403).
import {
    CreateProjectReleaseRequestBody,
    DiffReleaseRequest,
    ListProjectReleasesRequest,
    PrincipalType,
    ProjectRelease,
    ProjectSyncPlan,
    SeekPage,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ProjectResourceType } from '../../../core/security/authorization/common'
import { securityAccess } from '../../../core/security/authorization/fastify-security'
import { platformMustHaveFeatureEnabledOrPaymentRequired } from '../../authentication/ee-authorization'
import { ProjectReleaseEntity } from './project-release.entity'
import { projectReleaseService } from './project-release.service'

const DEFAULT_LIST_LIMIT = 10

export const projectReleaseModule: FastifyPluginAsyncZod = async (app) => {
    // Entitlement gate: when the plan does not include environment promotion the feature is
    // not available (a plan matter) → FEATURE_DISABLED (402), distinct from an authz denial.
    app.addHook('preHandler', platformMustHaveFeatureEnabledOrPaymentRequired((platform) => platform.plan.environmentsEnabled))
    await app.register(projectReleaseController, { prefix: '/v1/project-releases' })
}

const projectReleaseController: FastifyPluginAsyncZod = async (app) => {

    // List a workspace's releases. projectId comes from the query.
    app.get('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.QUERY,
            }),
        },
        schema: {
            querystring: ListProjectReleasesRequest,
        },
    }, async (request): Promise<SeekPage<ProjectRelease>> => {
        return projectReleaseService(request.log).list({
            projectId: request.query.projectId,
            cursor: request.query.cursor,
            limit: request.query.limit ?? DEFAULT_LIST_LIMIT,
        })
    })

    // Compute a sync plan (structural diff) without applying it. projectId is in the body.
    app.post('/diff', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.BODY,
            }),
        },
        schema: {
            body: DiffReleaseRequest,
        },
    }, async (request): Promise<ProjectSyncPlan> => {
        return projectReleaseService(request.log).diff({
            request: request.body,
            projectId: request.body.projectId,
            platformId: request.principal.platform.id,
        })
    })

    // Create (apply) a release. projectId is in the body; PROJECT/ROLLBACK sources are
    // validated inside the service. Returns the persisted release (200).
    app.post('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.BODY,
            }),
        },
        schema: {
            tags: ['project-releases'],
            summary: 'Create a project release',
            description: 'Create a project release (a versioned snapshot of the project\'s state).',
            body: CreateProjectReleaseRequestBody,
        },
    }, async (request): Promise<ProjectRelease> => {
        return projectReleaseService(request.log).create({
            request: request.body,
            projectId: request.body.projectId,
            platformId: request.principal.platform.id,
            importedBy: request.principal.type === PrincipalType.USER ? request.principal.id : null,
        })
    })

    // Get a single release. The project is resolved from the release row (:id), so a caller
    // outside the release's tenant is rejected (403).
    app.get('/:id', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.TABLE,
                tableName: ProjectReleaseEntity,
            }),
        },
        schema: {
            params: z.object({ id: z.string() }),
        },
    }, async (request): Promise<ProjectRelease> => {
        return projectReleaseService(request.log).getOneOrThrow({
            id: request.params.id,
            projectId: request.projectId,
        })
    })
}
