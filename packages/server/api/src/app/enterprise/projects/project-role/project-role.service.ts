// Clean-room implementation — project (workspace) role service (capability spec I.4 /
// C.3). A role names a set of discrete permissions, scoped to an organization for custom
// roles or platform-agnostic for the built-in defaults. This service resolves roles for
// authorization and provides the custom-role CRUD surface.
//
// The three built-in roles (Admin/Editor/Viewer) are seeded into `project_role` in every
// edition (they carry a null platform id). Custom roles are created per organization,
// available subject to entitlement.
import {
    IntellisperError,
    ibId,
    CreateProjectRoleRequestBody,
    DefaultProjectRole,
    ErrorCode,
    isNil,
    PlatformId,
    ProjectRole,
    RoleType,
    SeekPage,
    spreadIfDefined,
    UpdateProjectRoleRequestBody,
} from '@intelblocks/shared'
import { IsNull } from 'typeorm'
import { repoFactory } from '../../../core/db/repo-factory'
import { paginationHelper } from '../../../helper/pagination/pagination-utils'
import { ProjectMemberEntity } from '../project-members/project-member.entity'
import { ProjectRoleEntity } from './project-role.entity'

// The membership repository lives here because roles and memberships are read together
// during authorization; kept exported under this name for the existing consumers.
export const projectMemberRepo = repoFactory(ProjectMemberEntity)
const projectRoleRepo = repoFactory(ProjectRoleEntity)

export const projectRoleService = {

    // Resolve a role by its identifier. Used by authorization to expand a membership's
    // role into its permission set.
    async getOneOrThrowById({ id }: { id: string }): Promise<ProjectRole> {
        const role = await projectRoleRepo().findOneBy({ id })
        if (isNil(role)) {
            throw notFound(id)
        }
        return role
    },

    // Resolve a role by name. Built-in roles (null platform) are matched first so a
    // default name always resolves regardless of organization; otherwise the
    // organization's own custom role of that name is returned.
    async getOneOrThrow({ name, platformId }: { name: string, platformId: string }): Promise<ProjectRole> {
        const builtIn = await projectRoleRepo().findOneBy({ name, platformId: IsNull() })
        if (!isNil(builtIn)) {
            return builtIn
        }
        const custom = await projectRoleRepo().findOneBy({ name, platformId })
        if (isNil(custom)) {
            throw notFound(name)
        }
        return custom
    },

    // The id of a built-in default role, for provisioning memberships (e.g. inviting a
    // member with the Admin/Editor/Viewer default).
    async getDefaultRoleId({ name }: { name: DefaultProjectRole }): Promise<string> {
        const role = await projectRoleRepo().findOneBy({ name, platformId: IsNull() })
        if (isNil(role)) {
            throw notFound(name)
        }
        return role.id
    },

    // List an organization's roles: the platform-agnostic built-ins plus the
    // organization's own custom roles, each annotated with how many members hold it.
    async list({ platformId }: { platformId: PlatformId }): Promise<SeekPage<ProjectRole>> {
        const roles = await projectRoleRepo()
            .createQueryBuilder('project_role')
            .where('project_role."platformId" IS NULL OR project_role."platformId" = :platformId', { platformId })
            .getMany()

        const withCounts = await Promise.all(roles.map(async (role) => ({
            ...role,
            userCount: await projectMemberRepo().countBy({ projectRoleId: role.id }),
        })))
        return paginationHelper.createPage(withCounts, null)
    },

    // Create a custom role for an organization.
    async create({ platformId, request }: { platformId: string, request: CreateProjectRoleRequestBody }): Promise<ProjectRole> {
        return projectRoleRepo().save({
            id: ibId(),
            name: request.name,
            permissions: request.permissions,
            type: request.type ?? RoleType.CUSTOM,
            platformId,
        })
    },

    // Update a custom role within an organization. The platform-agnostic built-in roles
    // (Admin/Editor/Viewer, null platform) are immutable and cannot be reached here — the
    // update is scoped to the caller's platform, so a built-in is never matched.
    async update({ id, platformId, request }: { id: string, platformId: string, request: UpdateProjectRoleRequestBody }): Promise<ProjectRole> {
        const role = await this.getOneOrThrowById({ id })
        assertNotBuiltIn(role)
        await projectRoleRepo().update({ id, platformId }, {
            ...spreadIfDefined('name', request.name),
            ...spreadIfDefined('permissions', request.permissions),
        })
        return this.getOneOrThrowById({ id })
    },

    // Delete a custom role within an organization, identified by its id or its name.
    // Built-in roles are immutable; a role still assigned to members cannot be removed
    // (it would orphan those memberships); an unknown identifier yields a not-found error.
    // Returns the deleted role so the caller can record the change.
    async delete({ idOrName, platformId }: { idOrName: string, platformId: string }): Promise<ProjectRole> {
        const role = await projectRoleRepo().findOneBy({ id: idOrName, platformId })
            ?? await projectRoleRepo().findOneBy({ name: idOrName, platformId })
        if (isNil(role)) {
            throw notFound(idOrName)
        }
        assertNotBuiltIn(role)
        const inUse = await projectMemberRepo().countBy({ projectRoleId: role.id })
        if (inUse > 0) {
            throw new IntellisperError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Cannot delete a role that is still assigned to members.' },
            })
        }
        await projectRoleRepo().delete({ id: role.id, platformId })
        return role
    },
}

// The seeded, platform-agnostic default roles (null platform) are the immutable
// built-ins. An organization-scoped role — even one typed DEFAULT — is the org's own and
// remains mutable.
function assertNotBuiltIn(role: ProjectRole): void {
    if (isNil(role.platformId)) {
        throw new IntellisperError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'Built-in roles cannot be modified or deleted.' },
        })
    }
}

function notFound(entityId: string): IntellisperError {
    return new IntellisperError({
        code: ErrorCode.ENTITY_NOT_FOUND,
        params: { entityType: 'project_role', entityId },
    })
}
