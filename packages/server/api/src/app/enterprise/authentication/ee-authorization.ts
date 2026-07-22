// Clean-room authorization guards (fastify preHandlers), invoked via
// `.call(app, request, reply)`. Behavior derived from the MIT ownership model in
// core/security/v2/authz/authorize.ts (PlatformRole.ADMIN == platform owner) — a
// real, fail-safe check, not a permissive stub.
//
// `platformMustHaveFeatureEnabled` reads the platform plan flags (which the base
// edition exposes). The feature-flag values themselves are produced by the
// entitlement resolver (flags hooks); this guard only enforces them.
import {
    ErrorCode,
    IntellisperError,
    isNil,
    PlatformRole,
    PlatformWithoutSensitiveData,
    PrincipalType,
    ProjectType,
} from '@intelblocks/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { getProjectIdFromRequest } from '../../core/security/v2/authz/authorization-middleware'
import { platformService } from '../../platform/platform.service'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'

async function assertCurrentUserIsPlatformOwner(request: FastifyRequest): Promise<void> {
    const principal = request.principal
    // Service principals act on behalf of the platform (matches MIT authorize.ts).
    if (principal.type === PrincipalType.SERVICE) {
        return
    }
    const user = await userService(request.log).getOneOrFail({ id: principal.id })
    if (user.platformRole !== PlatformRole.ADMIN) {
        throw new IntellisperError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'User is not an admin/owner of the platform.' },
        })
    }
}

export async function platformMustBeOwnedByCurrentUser(this: unknown, request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    await assertCurrentUserIsPlatformOwner(request)
}

// For routes that mutate a platform identified by a `:id` path param: the caller must
// be the owner/admin **of that same platform**. A principal is always scoped to its own
// platform, so we require the target id to equal the caller's platform id — this closes
// the cross-platform edit/delete hole where an admin of platform A could act on platform
// B by supplying B's id.
export async function platformToEditMustBeOwnedByCurrentUser(this: unknown, request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const targetPlatformId = (request.params as { id?: string } | undefined)?.id
    const principal = request.principal
    if (principal.type !== PrincipalType.SERVICE
        && !isNil(targetPlatformId)
        && targetPlatformId !== principal.platform.id) {
        throw new IntellisperError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'User is not authorized to modify this platform.' },
        })
    }
    await assertCurrentUserIsPlatformOwner(request)
}

// Guard for invitation routes: project invitations may only target a *team* workspace,
// never a personal one (a personal project has a single owner and no membership to invite
// into). Engine and other non-user/non-service principals are out of scope for this human
// action and pass through; a missing project id is rejected as unauthorized.
export async function projectMustBeTeamType(this: unknown, request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const { type } = request.principal
    if (type !== PrincipalType.USER && type !== PrincipalType.SERVICE) {
        return
    }
    const projectId = await getProjectIdFromRequest(request)
    if (isNil(projectId)) {
        throw new IntellisperError({
            code: ErrorCode.AUTHORIZATION,
            params: { message: 'Project ID is required' },
        })
    }
    const project = await projectService(request.log).getOneOrThrow(projectId)
    if (project.type !== ProjectType.TEAM) {
        throw new IntellisperError({
            code: ErrorCode.VALIDATION,
            params: { message: 'Project must be a team project' },
        })
    }
}

// Factory: returns a preHandler that enforces a plan feature flag.
// The selector receives the platform with its plan flags (the exact return type
// of platformService.getOneWithPlanOrThrow).
type PlatformWithPlan = Omit<PlatformWithoutSensitiveData, 'usage'>

export function platformMustHaveFeatureEnabled(
    selector: (platform: PlatformWithPlan) => boolean,
): (this: unknown, request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async function (this: unknown, request: FastifyRequest, _reply: FastifyReply): Promise<void> {
        const principal = request.principal
        if (principal.type !== PrincipalType.USER && principal.type !== PrincipalType.SERVICE && principal.type !== PrincipalType.ENGINE) {
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Principal is not associated with a platform.' },
            })
        }
        const platform = await platformService(request.log).getOneWithPlanOrThrow(principal.platform.id)
        if (!selector(platform)) {
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'This feature is not enabled for your platform.' },
            })
        }
    }
}

// Like platformMustHaveFeatureEnabled, but a disabled feature is a *plan/entitlement*
// matter, so it denies with FEATURE_DISABLED (402 Payment Required) rather than an
// authorization failure (403). Use this for capabilities whose absence means "not on your
// plan" (e.g. environment promotion / project releases), keeping it distinct from an
// access-control denial. Authorization (Guarantee B) is still enforced separately and is
// never expressed through this gate.
export function platformMustHaveFeatureEnabledOrPaymentRequired(
    selector: (platform: PlatformWithPlan) => boolean,
): (this: unknown, request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async function (this: unknown, request: FastifyRequest, _reply: FastifyReply): Promise<void> {
        const principal = request.principal
        if (principal.type !== PrincipalType.USER && principal.type !== PrincipalType.SERVICE && principal.type !== PrincipalType.ENGINE) {
            throw new IntellisperError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Principal is not associated with a platform.' },
            })
        }
        const platform = await platformService(request.log).getOneWithPlanOrThrow(principal.platform.id)
        if (!selector(platform)) {
            throw new IntellisperError({
                code: ErrorCode.FEATURE_DISABLED,
                params: { message: 'This feature is not enabled for your platform.' },
            })
        }
    }
}
