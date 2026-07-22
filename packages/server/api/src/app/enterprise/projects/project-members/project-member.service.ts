// Clean-room implementation — project (workspace) membership service (capability spec
// I.4 / C.2). A membership binds (user, workspace, organization, role) and is the grant
// that authorization resolves a caller's role from.
//
// Role resolution rule (used by every permission check):
//  - the workspace owner always resolves to the built-in Admin role (full access);
//  - a user with a membership row resolves to that membership's assigned role;
//  - anyone else resolves to no role (null) — denied by the caller.
// This holds in all editions: community seeds only owners (so members get Admin), while
// enterprise/cloud add real memberships with granular roles.
import {
    DefaultProjectRole,
    ErrorCode,
    ibId,
    IntellisperError,
    isNil,
    Permission,
    ProjectMember,
    ProjectMemberWithUser,
    ProjectRole,
    SeekPage,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../../core/db/repo-factory'
import { paginationHelper } from '../../../helper/pagination/pagination-utils'
import { projectService } from '../../../project/project-service'
import { projectRoleService } from '../project-role/project-role.service'
import { ProjectMemberEntity } from './project-member.entity'

const projectMemberRepo = repoFactory(ProjectMemberEntity)

export const projectMemberService = (log: FastifyBaseLogger) => ({

    // Resolve the caller's effective role for a workspace, or null if they have none.
    async getRole({ projectId, userId }: { projectId: string, userId: string }): Promise<ProjectRole | null> {
        const project = await projectService(log).getOne(projectId)
        if (isNil(project)) {
            return null
        }
        // The owner always holds the built-in Admin role.
        if (project.ownerId === userId) {
            return projectRoleService.getOneOrThrow({ name: DefaultProjectRole.ADMIN, platformId: project.platformId })
        }
        const membership = await projectMemberRepo().findOneBy({ projectId, userId })
        if (isNil(membership)) {
            return null
        }
        return projectRoleService.getOneOrThrowById({ id: membership.projectRoleId })
    },

    // List a workspace's memberships (with the member's user record), each carrying the
    // assigned role.
    async list(params: {
        platformId: string
        projectId: string
        cursorRequest: string | null
        limit: number
        projectRoleId: string | undefined
    }): Promise<SeekPage<ProjectMemberWithUser>> {
        const members = await projectMemberRepo().find({
            where: {
                projectId: params.projectId,
                platformId: params.platformId,
                ...(isNil(params.projectRoleId) ? {} : { projectRoleId: params.projectRoleId }),
            },
            relations: { user: true, projectRole: true },
            take: params.limit,
        })
        return paginationHelper.createPage(members as unknown as ProjectMemberWithUser[], null)
    },

    // Whether a user holds a given permission on any workspace in an organization — used
    // to decide whether an embedded/non-admin user may perform an org-level action.
    async hasPermissionOnAnyProject({ userId, platformId, permission }: { userId: string, platformId: string, permission: Permission }): Promise<boolean> {
        const memberships = await projectMemberRepo().find({
            where: { userId, platformId },
            relations: { projectRole: true },
        })
        return memberships.some((membership) => {
            const role = (membership as unknown as { projectRole?: ProjectRole }).projectRole
            return !isNil(role) && role.permissions.includes(permission)
        })
    },

    // Resolve a membership by its id, or throw. Not tenant-scoped here: the caller is
    // expected to authorize access to the member's project afterwards, so a member that
    // belongs to another organization surfaces as an authorization failure (403) rather
    // than a not-found (404).
    async getOneOrThrow({ id }: { id: string }): Promise<ProjectMember> {
        const member = await projectMemberRepo().findOneBy({ id })
        if (isNil(member)) {
            throw new IntellisperError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'project_member', entityId: id },
            })
        }
        return member
    },

    // Change an existing member's role. The role is named either by a built-in role's
    // enum key (e.g. "VIEWER"), by a role's actual name (built-in "Viewer" or a custom
    // role), and is resolved within the member's organization.
    async updateRole({ member, roleName }: { member: ProjectMember, roleName: string }): Promise<ProjectMember> {
        const project = await projectService(log).getOneOrThrow(member.projectId)
        const resolvedName = resolveRoleName(roleName)
        const role = await projectRoleService.getOneOrThrow({ name: resolvedName, platformId: project.platformId })
        await projectMemberRepo().update({ id: member.id }, { projectRoleId: role.id })
        return { ...member, projectRoleId: role.id }
    },

    // Remove a membership by its id.
    async deleteById({ id }: { id: string }): Promise<void> {
        await projectMemberRepo().delete({ id })
    },

    // Create-or-update a member's role in a workspace (one membership per user/workspace).
    async upsert({ projectId, userId, projectRoleName }: { projectId: string, userId: string, projectRoleName: string }): Promise<ProjectMember> {
        const project = await projectService(log).getOneOrThrow(projectId)
        const role = await projectRoleService.getOneOrThrow({ name: projectRoleName, platformId: project.platformId })

        const existing = await projectMemberRepo().findOneBy({ projectId, userId, platformId: project.platformId })
        if (!isNil(existing)) {
            await projectMemberRepo().update({ id: existing.id }, { projectRoleId: role.id })
            return { ...existing, projectRoleId: role.id }
        }
        const created: ProjectMember = {
            id: ibId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            userId,
            platformId: project.platformId,
            projectId,
            projectRoleId: role.id,
        }
        await projectMemberRepo().save(created)
        return created
    },

    // Remove a member from a workspace.
    async delete({ projectId, userId, platformId }: { projectId: string, userId: string, platformId: string }): Promise<void> {
        await projectMemberRepo().delete({ projectId, userId, platformId })
    },
})

// Resolve a role identifier from a request into a role name. A built-in role's enum key
// (e.g. "VIEWER") maps to its name ("Viewer"); any other value is treated as a literal
// role name (a built-in name or an organization's custom role name).
function resolveRoleName(role: string): string {
    const defaultByKey = (DefaultProjectRole as Record<string, string>)[role]
    return defaultByKey ?? role
}
