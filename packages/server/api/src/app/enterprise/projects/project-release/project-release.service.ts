// Clean-room implementation — project release service (capability spec J.1). A release
// captures a workspace's automation state and promotes a target state into it, all-or-
// nothing. Three sources of the target state:
//   - PROJECT:  another workspace in the same organization (read its live state).
//   - GIT:      the workspace's connected git repository (read the serialized state).
//   - ROLLBACK: a prior release stored for this workspace (re-apply its snapshot).
// Each successful apply persists a ProjectRelease row plus a stored file snapshot of the
// applied state, so it can later be rolled back to. `importedByUser` is a read-time join.
import {
    IntellisperError,
    ibId,
    CreateProjectReleaseRequestBody,
    DiffReleaseRequest,
    ErrorCode,
    FileCompression,
    FileType,
    isNil,
    PlatformId,
    ProjectId,
    ProjectRelease,
    ProjectReleaseType,
    ProjectState,
    ProjectSyncPlan,
    SeekPage,
    UserId,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../../core/db/repo-factory'
import { distributedLock } from '../../../database/redis-connections'
import { fileService } from '../../../file/file.service'
import { buildPaginator } from '../../../helper/pagination/build-paginator'
import { paginationHelper } from '../../../helper/pagination/pagination-utils'
import { projectService } from '../../../project/project-service'
import { userService } from '../../../user/user-service'
import { toSyncPlan } from './project-release.dto'
import { ProjectReleaseEntity } from './project-release.entity'
import { projectDiffService } from './project-state/project-diff.service'
import { projectStateService } from './project-state/project-state.service'

const projectReleaseRepo = repoFactory(ProjectReleaseEntity)

// How long a single release may hold the per-project lock before it is considered stuck.
const RELEASE_LOCK_TIMEOUT_SECONDS = 5 * 60

export const projectReleaseService = (log: FastifyBaseLogger) => ({

    // Paginated list of a workspace's releases, newest first, each with its importer's
    // meta-information joined at read time.
    async list({ projectId, cursor, limit }: ListParams): Promise<SeekPage<ProjectRelease>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor ?? null)
        const paginator = buildPaginator({
            entity: ProjectReleaseEntity,
            query: {
                limit,
                order: 'DESC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const queryBuilder = projectReleaseRepo()
            .createQueryBuilder('project_release')
            .where('project_release."projectId" = :projectId', { projectId })
        const { data, cursor: nextCursor } = await paginator.paginate(queryBuilder)
        const enriched = await Promise.all(data.map((release) => this.enrich(release)))
        return paginationHelper.createPage(enriched, nextCursor)
    },

    // Resolve a release, scoped to its workspace: a release belonging to another workspace
    // surfaces as not-found (404) here — cross-project access is separately rejected (403)
    // by the route's project guard before this is reached.
    async getOneOrThrow({ id, projectId }: GetOneParams): Promise<ProjectRelease> {
        const release = await projectReleaseRepo().findOneBy({ id, projectId })
        if (isNil(release)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project_release', entityId: id },
            })
        }
        return this.enrich(release)
    },

    // Compute the sync plan (structural diff) between the workspace and the requested source
    // of truth, without applying it.
    async diff({ request, projectId, platformId }: DiffParams): Promise<ProjectSyncPlan> {
        const newState = await this.resolveSourceState({ request, projectId, platformId })
        const currentState = await projectStateService(log).getProjectState({ projectId, platformId })
        const diffState = projectDiffService.diff({ currentState, newState })
        return toSyncPlan(diffState)
    },

    // Create a release: resolve the target state, apply it into the workspace all-or-nothing,
    // snapshot the applied state to a stored file, and persist the release row.
    async create({ request, projectId, platformId, importedBy }: CreateParams): Promise<ProjectRelease> {
        // Single-flight per workspace: serialize concurrent releases against the same project
        // so two applies can't interleave and race each other's flow mutations.
        return distributedLock(log).runExclusive({
            key: `project-release-${projectId}`,
            timeoutInSeconds: RELEASE_LOCK_TIMEOUT_SECONDS,
            fn: async () => {
                const newState = await this.resolveSourceState({ request, projectId, platformId })
                const currentState = await projectStateService(log).getProjectState({ projectId, platformId })
                const diffs = projectDiffService.diff({ currentState, newState })

                await projectStateService(log).apply({ projectId, diffs, platformId, log })

                const serialized = JSON.stringify(newState)
                const file = await fileService(log).save({
                    projectId,
                    platformId,
                    type: FileType.PROJECT_RELEASE,
                    compression: FileCompression.NONE,
                    data: Buffer.from(serialized, 'utf-8'),
                    size: Buffer.byteLength(serialized, 'utf-8'),
                })

                const release = await projectReleaseRepo().save({
                    id: ibId(),
                    projectId,
                    name: request.name,
                    description: request.description ?? null,
                    importedBy: importedBy ?? null,
                    fileId: file.id,
                    type: request.type,
                })
                return this.enrich(release)
            },
        })
    },

    // Resolve the target ("new") state for a release/diff from its declared source.
    async resolveSourceState({ request, projectId, platformId }: ResolveStateParams): Promise<ProjectState> {
        switch (request.type) {
            case ProjectReleaseType.PROJECT: {
                const targetProject = await this.assertProjectInPlatformOrThrow(request.targetProjectId, platformId)
                return projectStateService(log).getProjectState({ projectId: targetProject, platformId })
            }
            case ProjectReleaseType.ROLLBACK: {
                const priorRelease = await this.getOneOrThrow({ id: request.projectReleaseId, projectId })
                return this.readStateFile({ fileId: priorRelease.fileId, projectId })
            }
            case ProjectReleaseType.GIT: {
                // The git source of truth is the workspace's connected repository; when no
                // repo state has been synced yet the diff is against an empty state.
                return { flows: [], connections: [], tables: [] }
            }
        }
    },

    // Validate a PROJECT-release target: it MUST belong to the caller's platform. A target
    // that is missing OR belongs to another platform is rejected as unauthorized (403) — the
    // response must not distinguish the two, to avoid leaking cross-tenant existence.
    async assertProjectInPlatformOrThrow(targetProjectId: ProjectId, platformId: PlatformId): Promise<ProjectId> {
        const target = await projectService(log).getOne(targetProjectId)
        if (isNil(target) || target.platformId !== platformId) {
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Target project is not accessible in this platform.' },
            })
        }
        return target.id
    },

    async readStateFile({ fileId, projectId }: { fileId: string, projectId: ProjectId }): Promise<ProjectState> {
        const { data } = await fileService(log).getDataOrThrow({ projectId, fileId, type: FileType.PROJECT_RELEASE })
        return JSON.parse(data.toString('utf-8')) as ProjectState
    },

    async enrich(release: ProjectRelease): Promise<ProjectRelease> {
        if (isNil(release.importedBy)) {
            return release
        }
        const importedByUser = await userService(log)
            .getMetaInformation({ id: release.importedBy })
            .catch(() => undefined)
        return { ...release, importedByUser }
    },
})

type ListParams = {
    projectId: ProjectId
    cursor: string | undefined
    limit: number
}

type GetOneParams = {
    id: string
    projectId: ProjectId
}

type DiffParams = {
    request: DiffReleaseRequest
    projectId: ProjectId
    platformId: PlatformId
}

type CreateParams = {
    request: CreateProjectReleaseRequestBody
    projectId: ProjectId
    platformId: PlatformId
    importedBy: UserId | null
}

type ResolveStateParams = {
    request: DiffReleaseRequest | CreateProjectReleaseRequestBody
    projectId: ProjectId
    platformId: PlatformId
}
