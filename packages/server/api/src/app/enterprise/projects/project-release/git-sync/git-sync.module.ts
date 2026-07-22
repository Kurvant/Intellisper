// Clean-room implementation — git repository (project-release version control) API
// (/v1/git-repos, capability spec J.1). Binds a workspace to an SSH git remote and lets it
// push its automation state. The whole feature is entitlement-gated on the platform plan's
// `environmentsEnabled` flag; every route is additionally project-scoped so a caller can
// only act on a repo belonging to a workspace they are a member of (cross-project access is
// rejected with 403 by the project security guard).
import {
    ConfigureRepoRequest,
    GitRepoWithoutSensitiveData,
    PrincipalType,
    PushGitRepoRequest,
    SeekPage,
} from '@intelblocks/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../../../core/security/authorization/common'
import { securityAccess } from '../../../../core/security/authorization/fastify-security'
import { platformMustHaveFeatureEnabledOrPaymentRequired } from '../../../authentication/ee-authorization'
import { GitRepoEntity } from './git-sync.entity'
import { gitRepoService } from './git-sync.service'

const ListRequestQuery = z.object({ projectId: z.string() })

export const gitRepoModule: FastifyPluginAsyncZod = async (app) => {
    // Gate the whole feature on the platform plan's environments entitlement (a plan matter
    // → FEATURE_DISABLED / 402 when absent, distinct from an authorization denial).
    app.addHook('preHandler', platformMustHaveFeatureEnabledOrPaymentRequired((platform) => platform.plan.environmentsEnabled))
    await app.register(gitRepoController, { prefix: '/v1/git-repos' })
}

const gitRepoController: FastifyPluginAsyncZod = async (app) => {

    // Configure (create/replace) the caller's workspace git repo. projectId is taken from the
    // body; the project guard rejects a body naming a workspace the caller isn't in (403).
    app.post('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.BODY,
            }),
        },
        schema: {
            tags: ['git-repos'],
            summary: 'Configure git sync',
            description: 'Create or update the git repository configuration for a project.',
            body: ConfigureRepoRequest,
        },
    }, async (request, reply): Promise<GitRepoWithoutSensitiveData> => {
        const gitRepo = await gitRepoService(request.log).upsert(request.body)
        return reply.status(StatusCodes.CREATED).send(gitRepo)
    })

    // List the workspace's git repo (zero or one). projectId comes from the query.
    app.get('/', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.QUERY,
            }),
        },
        schema: {
            querystring: ListRequestQuery,
        },
    }, async (request): Promise<SeekPage<GitRepoWithoutSensitiveData>> => {
        return gitRepoService(request.log).list({ projectId: request.query.projectId })
    })

    // Disconnect (delete) a git repo. The project is resolved from the repo row (:id), so a
    // caller outside the repo's tenant is rejected (403).
    app.delete('/:id', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.TABLE,
                tableName: GitRepoEntity,
            }),
        },
        schema: {
            params: z.object({ id: z.string() }),
        },
    }, async (request, reply): Promise<void> => {
        await gitRepoService(request.log).delete({ id: request.params.id, projectId: request.projectId })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    // Push the workspace's automation state to the configured remote/branch.
    app.post('/:id/push', {
        config: {
            security: securityAccess.project([PrincipalType.USER, PrincipalType.SERVICE], undefined, {
                type: ProjectResourceType.TABLE,
                tableName: GitRepoEntity,
            }),
        },
        schema: {
            params: z.object({ id: z.string() }),
            body: PushGitRepoRequest,
        },
    }, async (request, reply): Promise<void> => {
        await gitRepoService(request.log).push({
            id: request.params.id,
            projectId: request.projectId,
            platformId: request.principal.platform.id,
            userId: request.principal.type === PrincipalType.USER ? request.principal.id : null,
            request: request.body,
        })
        return reply.status(StatusCodes.OK).send()
    })
}
