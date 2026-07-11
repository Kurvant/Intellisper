// Clean-room implementation — SCIM 2.0 Group provisioning (capability spec B.5, "map directory
// groups to roles/memberships"). A SCIM Group is modeled as a TEAM workspace: creating a directory
// group provisions a team workspace, its members become workspace members, and directory group
// changes (rename, add/remove members, full membership replacement) are applied to the workspace.
//
// A group is keyed by (platform, externalId) → the workspace's externalId, so re-provisioning a
// group the IdP has seen returns/updates the existing workspace. De-provisioning (DELETE) SOFT-
// deletes the workspace (its GET then 404s), matching SCIM group-removal semantics while keeping
// the platform's idempotent hard-delete/cleanup path.
import {
    IntellisperError,
    CreateScimGroupRequest,
    DefaultProjectRole,
    ErrorCode,
    isNil,
    Project,
    ProjectType,
    ReplaceScimGroupRequest,
    ScimGroupResource,
    ScimPatchRequest,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { platformService } from '../../platform/platform.service'
import { projectService } from '../../project/project-service'
import { platformProjectService } from '../projects/platform-project-service'
import { projectMemberService } from '../projects/project-members/project-member.service'
import { toScimGroup } from './scim-common'

// The role SCIM-provisioned directory members receive in the workspace. Directory membership grants
// editor access; role mapping beyond this is an organization policy layered on separately.
const SCIM_MEMBER_ROLE = DefaultProjectRole.EDITOR

export const scimGroupService = (log: FastifyBaseLogger) => ({
    // Provision a directory group as a TEAM workspace (owned by the organization owner) and add its
    // members. Idempotent per (platform, externalId).
    async create({ platformId, request }: { platformId: string, request: CreateScimGroupRequest }): Promise<ScimGroupResource> {
        if (!isNil(request.externalId)) {
            const existing = await projectService(log).getByPlatformIdAndExternalId({ platformId, externalId: request.externalId })
            if (!isNil(existing)) {
                return this.replaceInternal(platformId, existing, request.displayName, memberIds(request.members))
            }
        }
        const platform = await platformService(log).getOneOrThrow(platformId)
        const project = await projectService(log).create({
            displayName: request.displayName,
            ownerId: platform.ownerId,
            platformId,
            externalId: request.externalId,
            type: ProjectType.TEAM,
        })
        await addMembers(log, platformId, project.id, memberIds(request.members))
        return toScimGroup(project, await listMemberIds(log, platformId, project.id))
    },

    // A single provisioned group (workspace) by id, scoped to the organization. Soft-deleted
    // workspaces are excluded (→ 404).
    async getOne({ platformId, id }: { platformId: string, id: string }): Promise<ScimGroupResource> {
        const project = await getScopedProjectOrThrow(log, platformId, id)
        return toScimGroup(project, await listMemberIds(log, platformId, id))
    },

    // List the organization's SCIM-provisioned groups (its TEAM workspaces).
    async list({ platformId }: { platformId: string }): Promise<ScimGroupResource[]> {
        const platform = await platformService(log).getOneOrThrow(platformId)
        const projects = await projectService(log).getAllForUser({ platformId, userId: platform.ownerId, isPrivileged: true })
        const teamProjects = projects.filter((project) => project.type === ProjectType.TEAM)
        return Promise.all(teamProjects.map(async (project) => toScimGroup(project, await listMemberIds(log, platformId, project.id))))
    },

    // Apply a SCIM PATCH — add members, remove members, or rename the group. Each operation is
    // applied in order; unknown paths are ignored (a tolerant IdP contract).
    async patch({ platformId, id, request }: { platformId: string, id: string, request: ScimPatchRequest }): Promise<ScimGroupResource> {
        const project = await getScopedProjectOrThrow(log, platformId, id)
        let displayName = project.displayName
        for (const operation of request.Operations) {
            const op = operation.op.toLowerCase()
            const path = operation.path
            if (path === 'displayName' && (op === 'replace' || op === 'add')) {
                displayName = String(operation.value)
                continue
            }
            if (isMembersPath(path)) {
                if (op === 'add') {
                    await addMembers(log, platformId, id, memberIds(operation.value))
                }
                else if (op === 'remove') {
                    await removeMembers(log, platformId, id, memberIdsToRemove(operation, path))
                }
                else if (op === 'replace') {
                    await replaceMembers(log, platformId, id, memberIds(operation.value))
                }
            }
        }
        if (displayName !== project.displayName) {
            await projectService(log).update(id, { displayName, type: ProjectType.TEAM })
        }
        const refreshed = await getScopedProjectOrThrow(log, platformId, id)
        return toScimGroup(refreshed, await listMemberIds(log, platformId, id))
    },

    // Replace a group (PUT) — a full re-assertion: the name and the member set become exactly those
    // in the request (members not present are removed, new ones added).
    async replace({ platformId, id, request }: { platformId: string, id: string, request: ReplaceScimGroupRequest }): Promise<ScimGroupResource> {
        const project = await getScopedProjectOrThrow(log, platformId, id)
        return this.replaceInternal(platformId, project, request.displayName, memberIds(request.members))
    },

    // De-provision (DELETE) — soft-delete the workspace.
    async delete({ platformId, id }: { platformId: string, id: string }): Promise<void> {
        await getScopedProjectOrThrow(log, platformId, id)
        await platformProjectService(log).markForDeletion({ id, platformId })
    },

    // Shared PUT-style reconciliation: set the name and make the membership exactly `userIds`.
    async replaceInternal(platformId: string, project: Project, displayName: string, userIds: string[]): Promise<ScimGroupResource> {
        if (displayName !== project.displayName) {
            await projectService(log).update(project.id, { displayName, type: ProjectType.TEAM })
        }
        await replaceMembers(log, platformId, project.id, userIds)
        const refreshed = await getScopedProjectOrThrow(log, platformId, project.id)
        return toScimGroup(refreshed, await listMemberIds(log, platformId, project.id))
    },
})

// Resolve a workspace by id, asserting it belongs to the organization and is not soft-deleted.
async function getScopedProjectOrThrow(log: FastifyBaseLogger, platformId: string, id: string): Promise<Project> {
    const project = await projectService(log).getOne(id)
    if (isNil(project) || project.platformId !== platformId) {
        throw new IntellisperError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityType: 'project', entityId: id },
        })
    }
    return project
}

async function listMemberIds(log: FastifyBaseLogger, platformId: string, projectId: string): Promise<string[]> {
    const page = await projectMemberService(log).list({ platformId, projectId, cursorRequest: null, limit: 1000, projectRoleId: undefined })
    return page.data.map((member) => member.userId)
}

async function addMembers(log: FastifyBaseLogger, platformId: string, projectId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
        await projectMemberService(log).upsert({ projectId, userId, projectRoleName: SCIM_MEMBER_ROLE })
    }
}

async function removeMembers(log: FastifyBaseLogger, platformId: string, projectId: string, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
        await projectMemberService(log).delete({ projectId, userId, platformId })
    }
}

// Make the membership exactly `userIds`: add the missing, remove the surplus.
async function replaceMembers(log: FastifyBaseLogger, platformId: string, projectId: string, userIds: string[]): Promise<void> {
    const current = new Set(await listMemberIds(log, platformId, projectId))
    const target = new Set(userIds)
    await addMembers(log, platformId, projectId, userIds.filter((id) => !current.has(id)))
    await removeMembers(log, platformId, projectId, [...current].filter((id) => !target.has(id)))
}

// Extract member ids from a SCIM members value: an array of `{value}` (add/replace).
function memberIds(members: unknown): string[] {
    if (!Array.isArray(members)) {
        return []
    }
    return members
        .map((member) => (typeof member === 'object' && member !== null && 'value' in member ? String((member as { value: unknown }).value) : undefined))
        .filter((value): value is string => !isNil(value))
}

// The member ids a `remove` operation targets: either from the operation value, or parsed from a
// filtered path like `members[value eq "<id>"]`.
function memberIdsToRemove(operation: { value?: unknown }, path: string | undefined): string[] {
    const fromValue = memberIds(operation.value)
    if (fromValue.length > 0) {
        return fromValue
    }
    const match = path?.match(/members\[value eq "([^"]+)"\]/i)
    return isNil(match) ? [] : [match[1]]
}

function isMembersPath(path: string | undefined): boolean {
    return !isNil(path) && (path === 'members' || path.startsWith('members['))
}
