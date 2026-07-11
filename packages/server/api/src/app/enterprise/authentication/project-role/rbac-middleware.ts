// Clean-room implementation — RBAC guard helpers layered on the resolution core
// (rbac-service). These are the entry points other features call to enforce a role's
// permission on a workspace, resolve a caller's role, or gate a flow operation by the
// permission it requires (capability spec I.3-B / I.4).
import {
    IntellisperError,
    ErrorCode,
    FlowOperationType,
    isNil,
    Permission,
    Principal,
    PrincipalType,
    ProjectId,
    ProjectRole,
} from '@intelblocks/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { projectMemberService } from '../../projects/project-members/project-member.service'
import { isRbacEnforcedEdition, rbacService } from './rbac-service'

// preHandler placeholder preserved so route registration is unchanged. Authorization is
// performed centrally by the v2 authz middleware (which calls rbacService); this hook
// intentionally does nothing on its own.
export const rbacMiddleware = async (_request: FastifyRequest): Promise<void> => {
    // Authorization is enforced in the v2 authz middleware via rbacService.
}

// Resolve the caller's role for a workspace, throwing if they hold none. Consumers read
// `.permissions`.
export async function getPrincipalRoleOrThrow(userId: string, projectId: string, log: FastifyBaseLogger): Promise<ProjectRole> {
    const role = await projectMemberService(log).getRole({ projectId, userId })
    if (isNil(role)) {
        throw new IntellisperError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'No role found for the user', userId, projectId },
        })
    }
    return role
}

// Assert a principal holds a specific permission on a workspace. A no-op in editions that
// do not enforce per-project roles; otherwise delegates to the resolution core.
export async function assertRoleHasPermission(principal: Principal, projectId: ProjectId, permission: Permission, log: FastifyBaseLogger): Promise<void> {
    if (!isRbacEnforcedEdition()) {
        return
    }
    await rbacService(log).assertPrinicpalAccessToProject({ principal, projectId, permission })
}

// Gate a flow operation by the permission it requires: state-changing operations need the
// run-status permission; structural edits need write-flow. A no-op where RBAC is not
// enforced.
export async function assertUserHasPermissionToFlow(principal: Principal, projectId: ProjectId, operationType: FlowOperationType, log: FastifyBaseLogger): Promise<void> {
    if (!isRbacEnforcedEdition()) {
        return
    }
    // Engine acts within its own bound project without a role check beyond binding.
    if (principal.type === PrincipalType.ENGINE) {
        await rbacService(log).assertPrinicpalAccessToProject({ principal, projectId, permission: undefined })
        return
    }
    const permission = permissionForFlowOperation(operationType)
    await rbacService(log).assertPrinicpalAccessToProject({ principal, projectId, permission })
}

// Map a flow operation to the permission it requires. Enabling/publishing changes run
// state; everything else that mutates the definition requires write access.
function permissionForFlowOperation(operationType: FlowOperationType): Permission {
    switch (operationType) {
        case FlowOperationType.LOCK_AND_PUBLISH:
        case FlowOperationType.CHANGE_STATUS:
            return Permission.UPDATE_FLOW_STATUS
        default:
            return Permission.WRITE_FLOW
    }
}
