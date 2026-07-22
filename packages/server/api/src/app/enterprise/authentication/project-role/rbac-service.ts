// Clean-room implementation — authorization guarantee B (role/permission enforcement),
// capability spec I.3-B / I.4. This is the always-on authorization core: for any action
// targeting a workspace it resolves the caller's role, expands it to a permission set,
// and confirms the required permission is granted. It is edition-independent for the
// binding checks; per-project permission checks apply where roles exist.
import {
    ErrorCode,
    IbEdition,
    IntellisperError,
    isNil,
    Permission,
    Principal,
    PrincipalType,
    ProjectId,
    ProjectRole,
} from '@intelblocks/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../../helper/system/system'
import { projectService } from '../../../project/project-service'
import { projectMemberService } from '../../projects/project-members/project-member.service'

export const rbacService = (log: FastifyBaseLogger) => ({

    // Assert the principal may act on the workspace with the (optional) required
    // permission. Dispatch by caller category, each carrying only the scope appropriate
    // to it (spec I.2 / I.3).
    async assertPrinicpalAccessToProject({ principal, permission, projectId }: AssertAccessParams): Promise<void> {
        switch (principal.type) {
            // No tenant scope → never permitted for a workspace action.
            case PrincipalType.UNKNOWN:
            case PrincipalType.WORKER:
            case PrincipalType.ONBOARDING:
                throw denied('Principal is not allowed to access this project', { projectId })

            // Interactive user → resolve membership role, then permission-check it.
            case PrincipalType.USER: {
                const role = await resolvePrincipalRole({ userId: principal.id, projectId, log })
                if (!roleGrants(role, permission)) {
                    throw new IntellisperError({
                        code: ErrorCode.PERMISSION_DENIED,
                        params: { userId: principal.id, projectId, projectRole: role, permission },
                    })
                }
                break
            }

            // Execution context → confined to its single bound workspace.
            case PrincipalType.ENGINE: {
                if (principal.projectId !== projectId) {
                    throw denied('Engine is not allowed to access this project', { projectId, engineProjectId: principal.projectId })
                }
                break
            }

            // Service/programmatic caller → permitted when the workspace is within its
            // organization.
            case PrincipalType.SERVICE: {
                const project = await projectService(log).getOneOrThrow(projectId)
                if (project.platformId !== principal.platform.id) {
                    throw denied('Service is not allowed to access this project', { projectId, platformId: principal.platform.id })
                }
                break
            }
        }
    },
})

type AssertAccessParams = {
    principal: Principal
    projectId: ProjectId
    permission: Permission | undefined
}

// Whether a resolved role grants the required permission. A route with no required
// permission only needs a role to be present; a required permission must be in the set.
function roleGrants(role: ProjectRole, permission: Permission | undefined): boolean {
    if (isNil(permission)) {
        return true
    }
    return role.permissions.includes(permission)
}

// Resolve a user's role for a workspace, or throw if they hold none. In editions that do
// not enforce per-project roles (community), every legitimate member resolves to a role
// via membership (owner → Admin); in enterprise/cloud the assigned role is returned.
async function resolvePrincipalRole({ userId, projectId, log }: { userId: string, projectId: string, log: FastifyBaseLogger }): Promise<ProjectRole> {
    const role = await projectMemberService(log).getRole({ projectId, userId })
    if (isNil(role)) {
        throw denied('No role found for the user', { userId, projectId })
    }
    return role
}

function denied(message: string, extra: Record<string, unknown>): IntellisperError {
    return new IntellisperError({
        code: ErrorCode.AUTHORIZATION,
        params: { message, ...extra },
    })
}

// Whether the running edition enforces per-project RBAC beyond tenant scoping.
export function isRbacEnforcedEdition(): boolean {
    return [IbEdition.CLOUD, IbEdition.ENTERPRISE].includes(system.getEdition())
}
